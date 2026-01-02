import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';

import { db } from './db.js';
import { requireAuth, signToken, verifyAdminPassword } from './auth.js';
import { wahaDeleteSession, wahaGetQrBase64, wahaListSessions, wahaRequestPairingCode, wahaStartSession } from './waha.js';
import { pickRandom, pickReplyFromScript } from './script.js';
import { startScheduler } from './scheduler.js';
import { WA12_PRESET } from './presets/wa12Preset.js';
import { sendTextQueued } from './sendQueue.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

function normalizePhoneNumber(value: string): string {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits;
}

function extractWahaSessionName(raw: any): string {
  return String(raw?.name || raw?.session || raw?.id || raw?.sessionName || '').trim();
}

function extractWahaPhoneNumber(raw: any): string | null {
  const candidates = [
    raw?.me?.user,
    raw?.me?.phoneNumber,
    raw?.me?.number,
    raw?.config?.phoneNumber,
    raw?.phoneNumber,
    raw?.number,
    raw?.wid,
    raw?.me?.id,
    raw?.me?.wid,
  ].filter(Boolean);

  for (const c of candidates) {
    const s = String(c);
    // handle wid/id like 62812xxxx@c.us
    const beforeAt = s.includes('@') ? s.split('@')[0] : s;
    const digits = normalizePhoneNumber(beforeAt);
    if (digits.length >= 7) return digits;
  }
  return null;
}

function isWahaConnected(raw: any): boolean {
  const status = String(raw?.status || raw?.state || raw?.connectionStatus || '').toLowerCase();
  if (raw?.me) return true;
  return (
    status.includes('work') ||
    status.includes('ready') ||
    status.includes('connect') ||
    status.includes('open') ||
    status.includes('auth') ||
    status.includes('running')
  );
}

async function getSessionToChatIdMap(): Promise<Record<string, string>> {
  try {
    const data: any = await wahaListSessions(true);
    const list: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.sessions)
        ? data.sessions
        : Array.isArray(data?.data)
          ? data.data
          : [];

    const map: Record<string, string> = {};
    for (const s of list) {
      const name = extractWahaSessionName(s);
      const phone = extractWahaPhoneNumber(s);
      if (name && phone && isWahaConnected(s)) {
        map[name] = `${phone}@c.us`;
      }
    }
    return map;
  } catch {
    return {};
  }
}


app.get('/waha/sessions/status', requireAuth, async (_req, res) => {
  try {
    const data: any = await wahaListSessions(true);
    const list: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.sessions)
        ? data.sessions
        : Array.isArray(data?.data)
          ? data.data
          : [];

    const sessions = list
      .map((s) => {
        const name = extractWahaSessionName(s);
        if (!name) return null;
        const phoneNumber = extractWahaPhoneNumber(s);
        return {
          name,
          connected: isWahaConnected(s),
          status: s?.status || s?.state || null,
          phoneNumber,
        };
      })
      .filter(Boolean);

    return res.json({ ok: true, sessions });
  } catch (e: any) {
    return res.status(502).json({ error: e?.message || 'WAHA error' });
  }
});

// --- WAHA Session Auth helpers (proxy) ---
// Docs reference:
// - QR: GET /api/{session}/auth/qr?format=image (Accept: application/json)
// - Pairing code: POST /api/{session}/auth/request-code { phoneNumber }
// - Start session: POST /api/sessions/{session}/start

app.post('/waha/sessions/:session/start', requireAuth, async (req, res) => {
  try {
    const data = await wahaStartSession(String(req.params.session));
    return res.json({ ok: true, data });
  } catch (e: any) {
    return res.status(502).json({ error: e?.message || 'WAHA error' });
  }
});

app.get('/waha/sessions/:session/qr', requireAuth, async (req, res) => {
  try {
    const data = await wahaGetQrBase64(String(req.params.session));
    return res.json({ ok: true, ...data });
  } catch (e: any) {
    return res.status(502).json({ error: e?.message || 'WAHA error' });
  }
});

app.post('/waha/sessions/:session/pairing-code', requireAuth, async (req, res) => {
  const bodySchema = z.object({
    phoneNumber: z.string().min(5),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const data = await wahaRequestPairingCode(String(req.params.session), parsed.data.phoneNumber);
    return res.json({ ok: true, ...data });
  } catch (e: any) {
    return res.status(502).json({ error: e?.message || 'WAHA error' });
  }
});

app.post('/auth/login', async (req, res) => {
  const bodySchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  if (parsed.data.username !== adminUsername) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await verifyAdminPassword(parsed.data.password);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken({ sub: 'admin', username: parsed.data.username });
  return res.json({ token });
});

const sessionCreateSchema = z.object({
  wahaSession: z.string().min(1),
  cluster: z.enum(['old', 'new']).optional().default('old'),
  autoReplyEnabled: z.boolean().optional().default(true),
  autoReplyMode: z.enum(['static', 'script']).optional().default('script'),
  scriptLineParity: z.enum(['odd', 'even', 'all']).optional(),
  autoReplyText: z.string().optional().default('Terima kasih, pesan Anda sudah kami terima.'),
  autoReplyScriptText: z.string().optional().default(WA12_PRESET.scriptText),
});

function parseListEnv(value?: string): string[] {
  return String(value || '')
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getWa12RuntimeConfig(reqBody: any): {
  newChatIds: string[];
  timezone: string;
  windowStart: string;
  windowEnd: string;
  day1MessagesPerNew: number;
  day2MessagesPerNew: number;
  day3MessagesPerNew: number;
} {
  const bodyNewChatIds = Array.isArray(reqBody?.newChatIds) ? reqBody.newChatIds : null;
  const envNewChatIds = parseListEnv(process.env.WA12_NEW_CHAT_IDS);
  const newChatIds = (bodyNewChatIds && bodyNewChatIds.length > 0)
    ? bodyNewChatIds.map((s: any) => String(s).trim()).filter(Boolean)
    : envNewChatIds;

  return {
    newChatIds,
    timezone: String(reqBody?.timezone || process.env.WA12_TIMEZONE || WA12_PRESET.automationDefaults.timezone),
    windowStart: String(reqBody?.windowStart || process.env.WA12_WINDOW_START || WA12_PRESET.automationDefaults.windowStart),
    windowEnd: String(reqBody?.windowEnd || process.env.WA12_WINDOW_END || WA12_PRESET.automationDefaults.windowEnd),
    day1MessagesPerNew: Number(reqBody?.day1MessagesPerNew ?? process.env.WA12_DAY1 ?? WA12_PRESET.automationDefaults.day1MessagesPerNew),
    day2MessagesPerNew: Number(reqBody?.day2MessagesPerNew ?? process.env.WA12_DAY2 ?? WA12_PRESET.automationDefaults.day2MessagesPerNew),
    day3MessagesPerNew: Number(reqBody?.day3MessagesPerNew ?? process.env.WA12_DAY3 ?? WA12_PRESET.automationDefaults.day3MessagesPerNew),
  };
}

function ensureWa12PresetSessions() {
  const upserted: any[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  const items: Array<{ name: string; cluster: 'old' | 'new' }> = [
    ...WA12_PRESET.oldSessionNames.map((name) => ({ name, cluster: 'old' as const })),
    ...WA12_PRESET.newSessionNames.map((name) => ({ name, cluster: 'new' as const })),
  ];

  for (const item of items) {
    const existing = db.getSessionByName(item.name);
    if (existing) {
      const updated = db.upsertSession({
        ...existing,
        cluster: item.cluster,
        autoReplyEnabled: true,
        autoReplyMode: 'script',
        scriptLineParity: item.cluster === 'new' ? WA12_PRESET.newScriptLineParity : WA12_PRESET.oldScriptLineParity,
        autoReplyScriptText: WA12_PRESET.scriptText,
        // keep existing autoReplyText as-is
      });
      updatedCount += 1;
      upserted.push(updated);
      continue;
    }

    const created = db.upsertSession({
      id: randomUUID(),
      wahaSession: item.name,
      cluster: item.cluster,
      autoReplyEnabled: true,
      autoReplyMode: 'script',
      scriptLineParity: item.cluster === 'new' ? WA12_PRESET.newScriptLineParity : WA12_PRESET.oldScriptLineParity,
      autoReplyText: 'Terima kasih, pesan Anda sudah kami terima.',
      autoReplyScriptText: WA12_PRESET.scriptText,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    createdCount += 1;
    upserted.push(created);
  }

  return { upserted, createdCount, updatedCount };
}

const sessionUpdateSchema = z.object({
  cluster: z.enum(['old', 'new']).optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyMode: z.enum(['static', 'script']).optional(),
  scriptLineParity: z.enum(['odd', 'even', 'all']).optional(),
  autoReplyText: z.string().optional(),
  autoReplyScriptText: z.string().optional(),
});

function randomTimesBetween(start: DateTime, end: DateTime, count: number): DateTime[] {
  const startMs = start.toMillis();
  const endMs = end.toMillis();
  const times: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = startMs + Math.floor(Math.random() * Math.max(1, endMs - startMs));
    times.push(t);
  }
  times.sort((a, b) => a - b);
  return times.map((ms) => DateTime.fromMillis(ms, { zone: start.zoneName || 'utc' }));
}

// --- Preset: WA12 (5 old + 10 new) ---
app.get('/presets/wa12', requireAuth, (_req, res) => {
  return res.json({
    ok: true,
    preset: {
      oldSessionNames: WA12_PRESET.oldSessionNames,
      newSessionNames: WA12_PRESET.newSessionNames,
      oldScriptLineParity: WA12_PRESET.oldScriptLineParity,
      newScriptLineParity: WA12_PRESET.newScriptLineParity,
      automationDefaults: WA12_PRESET.automationDefaults,
    },
  });
});

app.post('/presets/wa12/init', requireAuth, (_req, res) => {
  const result = ensureWa12PresetSessions();
  return res.json({ ok: true, ...result });
});

app.post('/presets/wa12/run', requireAuth, async (req, res) => {
  // 1) Validate runtime config (targets + schedule)
  const cfg = getWa12RuntimeConfig(req.body);
  if (!cfg.newChatIds || cfg.newChatIds.length === 0) {
    return res.status(400).json({
      error:
        'newChatIds kosong. Isi dari UI (body newChatIds) atau set env WA12_NEW_CHAT_IDS (comma/newline separated).',
    });
  }

  const tz = cfg.timezone;
  const now = DateTime.now().setZone(tz);
  if (!now.isValid) return res.status(400).json({ error: 'Invalid timezone' });

  const requestedOldSessionNames = Array.isArray((req.body as any)?.oldSessionNames)
    ? (req.body as any).oldSessionNames.map((s: any) => String(s).trim()).filter(Boolean)
    : WA12_PRESET.oldSessionNames;

  const [sh, sm] = cfg.windowStart.split(':').map((n) => Number(n));
  const [eh, em] = cfg.windowEnd.split(':').map((n) => Number(n));

  // 2) Get connected sessions first to avoid creating tasks for unpaired sessions
  const sessionToChatIdMap = await getSessionToChatIdMap();
  const connectedSessionNames = Object.keys(sessionToChatIdMap);

  // 3) Gather OLD and NEW sessions (only connected ones)
  const oldSessionsUnsorted = db
    .listSessions()
    .filter((s) => requestedOldSessionNames.includes(s.wahaSession))
    .filter((s) => s.cluster === 'old')
    .filter((s) => connectedSessionNames.includes(s.wahaSession))
    .filter((s) => (s.autoReplyScriptText || '').trim().length > 0);

  const newSessionsUnsorted = db
    .listSessions()
    .filter((s) => s.cluster === 'new')
    .filter((s) => connectedSessionNames.includes(s.wahaSession))
    .filter((s) => (s.autoReplyScriptText || '').trim().length > 0);

  // Ensure deterministic ordering (old-1, old-2, ... and new-1, new-2, ...)
  const oldSessions = [...oldSessionsUnsorted].sort((a, b) => a.wahaSession.localeCompare(b.wahaSession));
  const newSessions = [...newSessionsUnsorted].sort((a, b) => a.wahaSession.localeCompare(b.wahaSession));

  if (oldSessions.length === 0) {
    return res.status(400).json({ error: 'Tidak ada session OLD siap dipakai untuk campaign.' });
  }

  if (newSessions.length === 0) {
    return res.status(400).json({ error: 'Tidak ada session NEW dengan script untuk orchestrated conversation.' });
  }

  // Map each OLD session to its chatId (for NEW to reply back to)
  const oldSessionChatIds: Record<string, string> = {};
  for (const os of oldSessions) {
    const chatId = sessionToChatIdMap[os.wahaSession];
    if (chatId) {
      oldSessionChatIds[os.wahaSession] = chatId;
    }
  }

  // Map each NEW chatId to a NEW session (round-robin for even distribution)
  const newSessionMap: Record<string, string> = {};
  for (let i = 0; i < cfg.newChatIds.length; i++) {
    newSessionMap[cfg.newChatIds[i]] = newSessions[i % newSessions.length].wahaSession;
  }

  // Map each NEW chatId to an OLD session (rotating untuk distribusi merata)
  // Rotating: OLD-1 → OLD-2 → OLD-3 → OLD-4 → OLD-5 untuk setiap NEW target
  const newToOldMap: Record<string, string[]> = {};
  for (let i = 0; i < cfg.newChatIds.length; i++) {
    // Setiap NEW akan mendapat array 5 OLD sessions dalam urutan rotating
    newToOldMap[cfg.newChatIds[i]] = oldSessions.map(s => s.wahaSession);
  }

  // 4) Campaign initial send: distribute starting OLD fairly across targets
  const campaignResults: Array<{ chatId: string; fromSession: string; ok: boolean; error?: string }> = [];
  for (let i = 0; i < cfg.newChatIds.length; i++) {
    const chatId = cfg.newChatIds[i];
    const oldRotation = newToOldMap[chatId]; // Array of OLD sessions
    const startOldIndex = i % oldRotation.length;
    const oldSessionName = oldRotation[startOldIndex];
    const oldSession = db.getSessionByName(oldSessionName);
    if (!oldSession) {
      campaignResults.push({ chatId, fromSession: oldSessionName, ok: false, error: 'OLD session not found' });
      continue;
    }
    try {
      const parity = oldSession.scriptLineParity || 'odd';
      const picked = pickReplyFromScript(oldSession.autoReplyScriptText || '', 0, 0, parity);
      if (!picked) {
        campaignResults.push({ chatId, fromSession: oldSession.wahaSession, ok: false, error: 'Script kosong/tidak valid' });
        continue;
      }

      await sendTextQueued({ session: oldSession.wahaSession, chatId: String(chatId), text: picked.text });
      db.setChatProgress(oldSession.wahaSession, String(chatId), {
        seasonIndex: picked.nextSeasonIndex,
        lineIndex: picked.nextLineIndex,
        messageCount: 1, // Initial count
        lastOldIndex: startOldIndex,
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      campaignResults.push({ chatId, fromSession: oldSession.wahaSession, ok: true });
    } catch (e: any) {
      campaignResults.push({ chatId, fromSession: oldSession.wahaSession, ok: false, error: e?.message || 'unknown' });
    }
  }

  // 5) Build orchestrated conversation schedule
  // For each target NEW, we alternate OLD → NEW → OLD → NEW over 3 days
  const automationId = randomUUID();
  const automationName = String(req.body?.name || `wa12-${new Date().toISOString().slice(0, 10)}`);
  const startDate = now.toISODate()!;

  const automation = db.upsertAutomation({
    id: automationId,
    name: automationName,
    active: true,
    timezone: tz,
    windowStart: cfg.windowStart,
    windowEnd: cfg.windowEnd,
    day1MessagesPerNew: cfg.day1MessagesPerNew,
    day2MessagesPerNew: cfg.day2MessagesPerNew,
    day3MessagesPerNew: cfg.day3MessagesPerNew,
    newChatIds: cfg.newChatIds,
    oldSessionNames: requestedOldSessionNames,
    startDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const counts = [cfg.day1MessagesPerNew, cfg.day2MessagesPerNew, cfg.day3MessagesPerNew];
  const tasks = [] as any[];

  // Track cumulative message count dan OLD rotation per NEW target
  const targetState: Record<string, { messageCount: number; currentOldIndex: number }> = {};
  for (let i = 0; i < cfg.newChatIds.length; i++) {
    const newChatId = cfg.newChatIds[i];
    const oldRotation = newToOldMap[newChatId];
    const startOldIndex = i % oldRotation.length;
    targetState[newChatId] = {
      messageCount: 1, // Campaign initial sudah kirim 1 pesan
      currentOldIndex: startOldIndex + 1,
    };
  }

  // Build tasks dengan rotating OLD sessions dan delay 1.5 jam setelah setiap 24 pesan
  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const baseDay = now.plus({ days: dayOffset }).startOf('day');
    const start = baseDay.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const end = baseDay.set({ hour: eh, minute: em, second: 0, millisecond: 0 });

    const messagesCount = counts[dayOffset] ?? 0;
    if (messagesCount <= 0) continue;

    for (const newChatId of cfg.newChatIds) {
      const newSessionForThisTarget = newSessionMap[newChatId];
      const oldRotation = newToOldMap[newChatId]; // Array of 5 OLD sessions
      
      // Untuk day 1, kurangi 1 karena campaign initial sudah kirim
      const remainingMessages = dayOffset === 0 ? messagesCount - 1 : messagesCount;
      
      if (remainingMessages <= 0) continue;

      // Generate times
      let times = randomTimesBetween(start, end, remainingMessages);
      
      // Tambahkan delay 1.5 jam setiap mencapai kelipatan 24 pesan
      const state = targetState[newChatId];
      const delayMinutes = 90; // 1.5 jam
      const delayThreshold = 24; // Delay setiap 24 pesan
      
      // Calculate delays needed
      const timesWithDelays: any[] = [];
      let delayAccumulated = 0;
      
      for (let i = 0; i < times.length; i++) {
        const messageNumberAfterThis = state.messageCount + i + 1;
        
        // Check if we just crossed a 24-message threshold
        const previousThresholds = Math.floor((state.messageCount + i) / delayThreshold);
        const currentThresholds = Math.floor(messageNumberAfterThis / delayThreshold);
        
        if (currentThresholds > previousThresholds) {
          // We crossed a threshold, add delay
          delayAccumulated += delayMinutes;
        }
        
        timesWithDelays.push(times[i].plus({ minutes: delayAccumulated }));
      }
      
      times = timesWithDelays;

      // Get OLD chat IDs untuk semua OLD sessions
      const oldChatIds: Record<string, string> = {};
      for (const oldSessionName of oldRotation) {
        if (oldSessionChatIds[oldSessionName]) {
          oldChatIds[oldSessionName] = oldSessionChatIds[oldSessionName];
        }
      }

      // Cek apakah semua OLD sessions connected
      const connectedOldSessions = oldRotation.filter(name => oldChatIds[name]);
      if (connectedOldSessions.length === 0) {
        console.warn(`⚠️  No OLD sessions connected, skipping orchestrated schedule for target ${newChatId}`);
        continue;
      }

      // Build tasks dengan rotating OLD (lanjutkan dari state sebelumnya)
      let currentOldIndex = state.currentOldIndex;
      
      for (let i = 0; i < times.length; i += 1) {
        const isOddIndex = i % 2 === 0;
        
        if (isOddIndex) {
          // OLD kirim ke NEW
          // Rotating: gunakan OLD sesuai urutan
          const oldSessionName = oldRotation[currentOldIndex % oldRotation.length];
          const oldChatIdForReply = oldChatIds[oldSessionName];
          
          if (!oldChatIdForReply) {
            // Skip jika OLD session tidak connected
            console.warn(`⚠️  OLD session ${oldSessionName} not connected, skipping message`);
            // Advance rotation so we don't get stuck retrying the same OLD
            currentOldIndex++;
            continue;
          }

          tasks.push({
            id: randomUUID(),
            automationId,
            dueAt: times[i].toUTC().toISO()!,
            chatId: newChatId,
            senderSession: oldSessionName,
            kind: 'script-next',
            status: 'pending',
            targetNewChatId: newChatId, // Track target NEW
            oldRotationIndex: currentOldIndex % oldRotation.length, // Track OLD index
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          
          // Move to next OLD session
          currentOldIndex++;
        } else {
          // NEW balas ke OLD yang terakhir kirim
          const lastOldIndex = (currentOldIndex - 1) % oldRotation.length;
          const lastOldSessionName = oldRotation[lastOldIndex];
          const oldChatIdForReply = oldChatIds[lastOldSessionName];
          
          if (!oldChatIdForReply) {
            console.warn(`⚠️  OLD session ${lastOldSessionName} not connected, skipping reply`);
            continue;
          }

          tasks.push({
            id: randomUUID(),
            automationId,
            dueAt: times[i].toUTC().toISO()!,
            chatId: oldChatIdForReply,
            senderSession: newSessionForThisTarget,
            kind: 'script-next',
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      
      // Update state untuk hari berikutnya
      targetState[newChatId].messageCount += remainingMessages;
      targetState[newChatId].currentOldIndex = currentOldIndex;
    }
  }

  db.replaceScheduledTasksForAutomation(automationId, tasks);

  return res.json({
    ok: true,
    campaign: { results: campaignResults },
    automation,
    scheduled: tasks.length,
    mode: 'orchestrated',
  });
});

app.get('/sessions', requireAuth, (_req, res) => {
  res.json({ sessions: db.listSessions() });
});

app.post('/sessions', requireAuth, (req, res) => {
  const parsed = sessionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (db.getSessionByName(parsed.data.wahaSession)) {
    return res.status(409).json({ error: 'Session already exists' });
  }

  const created = db.upsertSession({
    id: randomUUID(),
    wahaSession: parsed.data.wahaSession,
    cluster: parsed.data.cluster,
    autoReplyEnabled: parsed.data.autoReplyEnabled,
    autoReplyMode: parsed.data.autoReplyMode,
    scriptLineParity: parsed.data.scriptLineParity,
    autoReplyText: parsed.data.autoReplyText,
    autoReplyScriptText: parsed.data.autoReplyScriptText,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return res.status(201).json({ session: created });
});

app.post('/sessions/bulk', requireAuth, (req, res) => {
  const bulkSchema = z.object({
    wahaSessions: z.array(z.string().min(1)).min(1),
    cluster: z.enum(['old', 'new']).optional().default('old'),
    autoReplyEnabled: z.boolean().optional().default(false),
    autoReplyMode: z.enum(['static', 'script']).optional().default('static'),
    scriptLineParity: z.enum(['odd', 'even', 'all']).optional(),
    autoReplyText: z.string().optional().default('Terima kasih, pesan Anda sudah kami terima.'),
    autoReplyScriptText: z.string().optional().default(''),
  });

  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const normalized = Array.from(
    new Set(parsed.data.wahaSessions.map((s) => s.trim()).filter(Boolean))
  );
  if (normalized.length === 0) {
    return res.status(400).json({ error: 'wahaSessions kosong' });
  }

  const created: any[] = [];
  const skipped: Array<{ wahaSession: string; reason: string }> = [];
  const parityProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'scriptLineParity');
  const computedParity = parityProvided
    ? parsed.data.scriptLineParity
    : (parsed.data.cluster === 'new' ? WA12_PRESET.newScriptLineParity : WA12_PRESET.oldScriptLineParity);

  for (const wahaSession of normalized) {
    if (db.getSessionByName(wahaSession)) {
      skipped.push({ wahaSession, reason: 'exists' });
      continue;
    }

    const s = db.upsertSession({
      id: randomUUID(),
      wahaSession,
      cluster: parsed.data.cluster,
      autoReplyEnabled: parsed.data.autoReplyEnabled,
      autoReplyMode: parsed.data.autoReplyMode,
      scriptLineParity: computedParity,
      autoReplyText: parsed.data.autoReplyText,
      autoReplyScriptText: parsed.data.autoReplyScriptText,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    created.push(s);
  }

  return res.status(201).json({ ok: true, createdCount: created.length, skippedCount: skipped.length, created, skipped });
});

app.patch('/sessions/:id', requireAuth, (req, res) => {
  const existing = db.getSessionById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  const parsed = sessionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updated = db.upsertSession({
    ...existing,
    ...parsed.data,
    id: existing.id,
    wahaSession: existing.wahaSession,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });

  return res.json({ session: updated });
});

app.delete('/sessions/:id', requireAuth, (req, res) => {
  const existing = db.getSessionById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Delete WAHA session first so UI delete mirrors WAHA delete behavior.
  // Ignore 404 from WAHA (already deleted), but surface other errors.
  return (async () => {
    try {
      await wahaDeleteSession(existing.wahaSession);
    } catch (e: any) {
      const msg = String(e?.message || '');
      const notFound = msg.includes('404') || msg.toLowerCase().includes('not found');
      if (!notFound) {
        return res.status(502).json({ error: e?.message || 'WAHA error' });
      }
    }

    const ok = db.deleteSession(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(204).send();
  })();
});

// Automation: jadwalkan pesan otomatis per hari (08-22) dengan target messages per NEW.
// Body minimal: { newChatIds: string[], day1MessagesPerNew, day2MessagesPerNew, day3MessagesPerNew, windowStart, windowEnd, timezone }
app.post('/automations/start', requireAuth, (req, res) => {
  const bodySchema = z.object({
    name: z.string().optional().default('default'),
    timezone: z.string().optional().default('Asia/Jakarta'),
    windowStart: z.string().regex(/^\d{2}:\d{2}$/).optional().default('08:00'),
    windowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().default('22:00'),
    day1MessagesPerNew: z.number().int().min(0).optional().default(24),
    day2MessagesPerNew: z.number().int().min(0).optional().default(36),
    day3MessagesPerNew: z.number().int().min(0).optional().default(42),
    newChatIds: z.array(z.string().min(1)).min(1),
    oldSessionNames: z.array(z.string().min(1)).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const tz = parsed.data.timezone;
  const now = DateTime.now().setZone(tz);
  if (!now.isValid) {
    return res.status(400).json({ error: 'Invalid timezone' });
  }

  const [sh, sm] = parsed.data.windowStart.split(':').map((n) => Number(n));
  const [eh, em] = parsed.data.windowEnd.split(':').map((n) => Number(n));

  const counts = [
    parsed.data.day1MessagesPerNew,
    parsed.data.day2MessagesPerNew,
    parsed.data.day3MessagesPerNew,
  ];

  const automationId = randomUUID();
  const startDate = now.toISODate()!;

  const automation = db.upsertAutomation({
    id: automationId,
    name: parsed.data.name,
    active: true,
    timezone: tz,
    windowStart: parsed.data.windowStart,
    windowEnd: parsed.data.windowEnd,
    day1MessagesPerNew: parsed.data.day1MessagesPerNew,
    day2MessagesPerNew: parsed.data.day2MessagesPerNew,
    day3MessagesPerNew: parsed.data.day3MessagesPerNew,
    newChatIds: parsed.data.newChatIds,
    oldSessionNames: parsed.data.oldSessionNames,
    startDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const tasks = [] as any[];
  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const baseDay = now.plus({ days: dayOffset }).startOf('day');
    const start = baseDay.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const end = baseDay.set({ hour: eh, minute: em, second: 0, millisecond: 0 });

    const perNew = counts[dayOffset] ?? 0;
    if (perNew <= 0) continue;

    for (const chatId of parsed.data.newChatIds) {
      const times = randomTimesBetween(start, end, perNew);
      for (const t of times) {
        tasks.push({
          id: randomUUID(),
          automationId,
          dueAt: t.toUTC().toISO()!,
          chatId,
          kind: 'script-next',
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  db.replaceScheduledTasksForAutomation(automationId, tasks);
  return res.json({ ok: true, automation, scheduled: tasks.length });
});

app.get('/automations', requireAuth, (_req, res) => {
  res.json({ automations: db.listAutomations() });
});

app.delete('/automations/:id', requireAuth, (req, res) => {
  const ok = db.deleteAutomation(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  return res.status(204).send();
});

// Campaign: 5 old -> random ke list new (contoh 10 target).
// Body: { newChatIds: string[] }
// Syarat: ada minimal 1 session cluster=old, autoReplyEnabled=true, mode=script.
app.post('/campaigns/start', requireAuth, async (req, res) => {
  const bodySchema = z.object({
    newChatIds: z.array(z.string().min(1)).min(1),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const oldSessions = db
    .listSessions()
    .filter((s) => s.cluster === 'old' && s.autoReplyEnabled && (s.autoReplyMode || 'static') === 'script')
    .filter((s) => (s.autoReplyScriptText || '').trim().length > 0);

  if (oldSessions.length === 0) {
    return res.status(400).json({
      error: 'Tidak ada session OLD yang aktif (mode script) untuk campaign.',
    });
  }

  const results: Array<{ chatId: string; fromSession: string; ok: boolean; error?: string }> = [];

  for (const chatId of parsed.data.newChatIds) {
    const chosen = pickRandom(oldSessions);
    try {
      const parity = chosen.scriptLineParity || 'odd';
      const picked = pickReplyFromScript(chosen.autoReplyScriptText || '', 0, 0, parity);
      if (!picked) {
        results.push({ chatId, fromSession: chosen.wahaSession, ok: false, error: 'Script kosong/tidak valid' });
        continue;
      }

      await sendTextQueued({ session: chosen.wahaSession, chatId: String(chatId), text: picked.text });
      db.setChatProgress(chosen.wahaSession, String(chatId), {
        seasonIndex: picked.nextSeasonIndex,
        lineIndex: picked.nextLineIndex,
        updatedAt: new Date().toISOString(),
      });

      results.push({ chatId, fromSession: chosen.wahaSession, ok: true });
    } catch (e: any) {
      results.push({ chatId, fromSession: chosen.wahaSession, ok: false, error: e?.message || 'unknown' });
    }
  }

  return res.json({ ok: true, results });
});

// Webhook endpoint for WAHA.
// Configure WAHA to call: http://<api-host>:4000/waha/webhook
// The payload shape depends on WAHA version; we handle a few common fields.
app.post('/waha/webhook', async (req, res) => {
  try {
    const body = req.body as any;

    const WEBHOOK_DEBUG = String(process.env.WEBHOOK_DEBUG || '').trim() === '1';
    const debug = (...args: any[]) => {
      if (!WEBHOOK_DEBUG) return;
      // eslint-disable-next-line no-console
      console.log('[waha.webhook]', ...args);
    };

    const msg =
      body?.message ||
      body?.payload?.message ||
      body?.payload?.messages?.[0] ||
      body?.messages?.[0] ||
      body?.payload?.data ||
      body?.data?.[0] ||
      body?.payload;

    const key = msg?.key || body?.key || body?.payload?.key;

    const session =
      body.session ||
      body?.payload?.session ||
      body?.sessionName ||
      body?.instance ||
      body?.instanceId ||
      body?.payload?.instance ||
      body?.payload?.instanceId;

    const fromMe =
      body.fromMe ??
      body?.payload?.fromMe ??
      key?.fromMe ??
      msg?.fromMe;

    const chatId =
      body.chatId ||
      body?.payload?.chatId ||
      body?.from ||
      msg?.chatId ||
      msg?.from ||
      key?.remoteJid ||
      key?.chatId ||
      key?.remoteId;

    const text =
      body.text ||
      body?.payload?.text ||
      body?.message?.text ||
      body?.body ||
      msg?.text ||
      msg?.body ||
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      msg?.message?.imageMessage?.caption ||
      msg?.message?.videoMessage?.caption ||
      msg?.message?.documentMessage?.caption;

    const inboundMessageId =
      body.id ||
      body.messageId ||
      body?.payload?.id ||
      body?.payload?.messageId ||
      body?.message?.id ||
      msg?.id ||
      key?.id;

    if (!session || !chatId) {
      debug('ignored:missing_session_or_chatId', { session, chatId, keys: Object.keys(body || {}) });
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (fromMe) {
      debug('ignored:fromMe', { session, chatId });
      return res.status(200).json({ ok: true, ignored: true });
    }

    const config = db.getSessionByName(String(session));
    if (!config?.autoReplyEnabled) {
      debug('ignored:no_config_or_disabled', { session, chatId, hasConfig: !!config });
      return res.status(200).json({ ok: true, ignored: true });
    }

    const mode = config.autoReplyMode || 'static';
    if (mode === 'script' && (config.autoReplyScriptText || '').trim()) {
      const progress = db.getChatProgress(config.wahaSession, String(chatId)) || {
        seasonIndex: 0,
        lineIndex: 0,
        messageCount: 0,
        updatedAt: new Date().toISOString(),
      };

      if (inboundMessageId && progress.lastInboundMessageId === String(inboundMessageId)) {
        debug('ignored:duplicate_inbound', { session, chatId, inboundMessageId });
        return res.status(200).json({ ok: true, ignored: true });
      }

      const parity = config.scriptLineParity || 'odd';
      const picked = pickReplyFromScript(
        config.autoReplyScriptText || '',
        progress.seasonIndex,
        progress.lineIndex,
        parity
      );
      if (!picked) {
        // Script habis → stop balas.
        db.setChatProgress(config.wahaSession, String(chatId), {
          ...progress,
          lastInboundMessageId: inboundMessageId ? String(inboundMessageId) : progress.lastInboundMessageId,
          updatedAt: new Date().toISOString(),
        });
        debug('ignored:script_exhausted', { session, chatId });
        return res.status(200).json({ ok: true, ignored: true });
      }

      await sendTextQueued({ session: config.wahaSession, chatId: String(chatId), text: picked.text });
      
      // Update progress dengan message count increment (incoming + outgoing = +2)
      const newMessageCount = (progress.messageCount || 0) + 2; // +1 untuk incoming, +1 untuk outgoing
      db.setChatProgress(config.wahaSession, String(chatId), {
        seasonIndex: picked.nextSeasonIndex,
        lineIndex: picked.nextLineIndex,
        messageCount: newMessageCount,
        lastInboundMessageId: inboundMessageId ? String(inboundMessageId) : progress.lastInboundMessageId,
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      debug('sent:script', { session, chatId, preview: String(picked.text || '').slice(0, 40), messageCount: newMessageCount });

      return res.status(200).json({ ok: true });
    }

    const replyText = config.autoReplyText || 'Terima kasih, pesan Anda sudah kami terima.';
    // Tetap balas untuk non-text messages juga.
    await sendTextQueued({ session: config.wahaSession, chatId: String(chatId), text: replyText });
    debug('sent:static', { session, chatId, preview: String(replyText || '').slice(0, 40) });
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    // Don't fail the webhook hard; WAHA might retry.
    return res.status(200).json({ ok: true, error: err?.message || 'unknown' });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});

startScheduler();
