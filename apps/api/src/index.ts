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

let sessionToChatIdCache: { value: Record<string, string>; expiresAt: number } | null = null;

async function getSessionToChatIdMapCached(ttlMs = 30_000): Promise<Record<string, string>> {
  const now = Date.now();
  if (sessionToChatIdCache && now < sessionToChatIdCache.expiresAt) return sessionToChatIdCache.value;
  const value = await getSessionToChatIdMap();
  sessionToChatIdCache = { value, expiresAt: now + Math.max(1_000, ttlMs) };
  return value;
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
  firstReplyDelayMinutes: number;
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
    firstReplyDelayMinutes: Math.max(
      0,
      Number(reqBody?.firstReplyDelayMinutes ?? process.env.WA12_FIRST_REPLY_DELAY_MINUTES ?? 30)
    ),
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

  const oldIndexByName: Record<string, number> = {};
  for (let i = 0; i < oldSessions.length; i++) oldIndexByName[oldSessions[i].wahaSession] = i;

  if (oldSessions.length === 0) {
    return res.status(400).json({ error: 'Tidak ada session OLD siap dipakai untuk campaign.' });
  }

  if (newSessions.length === 0) {
    return res.status(400).json({ error: 'Tidak ada session NEW dengan script untuk orchestrated conversation.' });
  }

  // Map each OLD session to its chatId (for NEW to reply back to)
  // Must be available or wave system won't work
  const oldSessionChatIds: Record<string, string> = {};
  for (const os of oldSessions) {
    const chatId = sessionToChatIdMap[os.wahaSession];
    if (chatId) {
      oldSessionChatIds[os.wahaSession] = chatId;
    }
  }

  // Validate: All OLD sessions must have chatId for wave system
  const missingOldChatIds = oldSessions.filter(os => !oldSessionChatIds[os.wahaSession]);
  if (missingOldChatIds.length > 0) {
    console.error('❌ OLD sessions without chatId:', missingOldChatIds.map(s => s.wahaSession));
    return res.status(400).json({
      error: 'OLD sessions not properly connected. Cannot build wave tasks.',
      missingSessions: missingOldChatIds.map(s => s.wahaSession)
    });
  }

  // Map target NEW chatId -> NEW session.
  // Prefer exact match based on WAHA connected phoneNumber (sessionToChatIdMap),
  // otherwise fallback to round-robin NEW sessions.
  const newChatIdToNewSession: Record<string, string> = {};
  for (const ns of newSessions) {
    const chatId = sessionToChatIdMap[ns.wahaSession];
    if (chatId) newChatIdToNewSession[chatId] = ns.wahaSession;
  }

  function parseNewIndex(name: string): number | null {
    const m = /^new-(\d+)$/i.exec(String(name || '').trim());
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Order targets by their NEW session index (new-1..new-10) so pairing is stable
  // even if cfg.newChatIds arrives in a different order.
  const orderedTargets = cfg.newChatIds
    .map((chatId, i) => ({ chatId, i, newSessionName: newChatIdToNewSession[chatId] || '' }))
    .sort((a, b) => {
      const ai = parseNewIndex(a.newSessionName);
      const bi = parseNewIndex(b.newSessionName);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a.i - b.i;
    })
    .map((t) => t.chatId);

  const newSessionFallbackMap: Record<string, string> = {};
  for (let i = 0; i < cfg.newChatIds.length; i++) {
    newSessionFallbackMap[cfg.newChatIds[i]] = newSessions[i % newSessions.length].wahaSession;
  }

  // Assign: Distribute NEW targets evenly across OLD sessions (flexible ratio)
  // Issue #3 fix: Tidak hardcode 2 NEW per OLD, support any ratio
  const assignedOldByNewChatId: Record<string, string> = {};
  const targetsPerOld = Math.ceil(orderedTargets.length / oldSessions.length);
  for (let i = 0; i < orderedTargets.length; i++) {
    const oldIndex = Math.floor(i / targetsPerOld) % oldSessions.length;
    assignedOldByNewChatId[orderedTargets[i]] = oldSessions[oldIndex].wahaSession;
  }

  // 4) Create automation record first (before heavy work)
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

  // 5) Return response immediately - don't block client
  res.json({
    ok: true,
    automation,
    status: 'starting',
    message: 'Campaign is starting. OLD blast will begin shortly, then wave tasks will be scheduled.',
    targets: orderedTargets.length,
    waves: oldSessions.length,
  });

  // 6) Run campaign blast + wave generation in background
  (async () => {
    try {
      console.log(`🚀 Starting campaign ${automationId}: ${orderedTargets.length} targets, ${oldSessions.length} waves`);

      // Suppress NEW auto-replies while we blast from OLD and build scheduled tasks.
      // This prevents NEW webhook from firing immediately (spiky pattern / inconsistent pairing).
      db.setSuppressNewAutoReplyUntil(DateTime.now().plus({ days: 7 }).toUTC().toISO()!);

      // Campaign initial send: OLD sends first to each NEW target
      const campaignResults: Array<{ chatId: string; fromSession: string; ok: boolean; error?: string }> = [];
      for (let i = 0; i < orderedTargets.length; i++) {
        const chatId = orderedTargets[i];
        const oldIndex = Math.floor(i / 2) % oldSessions.length;
        const oldSession = oldSessions[oldIndex];
        const oldSessionName = oldSession.wahaSession;
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
            lastOldIndex: oldIndex,
            lastMessageAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          campaignResults.push({ chatId, fromSession: oldSession.wahaSession, ok: true });
        } catch (e: any) {
          campaignResults.push({ chatId, fromSession: oldSession.wahaSession, ok: false, error: e?.message || 'unknown' });
        }
      }

      const successCount = campaignResults.filter(r => r.ok).length;
      console.log(`✅ OLD blast complete: ${successCount}/${orderedTargets.length} sent successfully`);

      const tasks = [] as any[];

      // Campaign Configuration - now configurable via environment variables
      // Reduced defaults for safer warm-up
      const TOTAL_WINDOWS = Number(process.env.TOTAL_WINDOWS || 5); // spread across 5 windows (was: 3)
      const MESSAGES_PER_WAVE = Number(process.env.MESSAGES_PER_WAVE || 15); // reduced from 72 to 15
      const TOTAL_WAVES = oldSessions.length; // Jumlah wave = jumlah OLD sessions
      const BASE_DELAY_MINUTES = 1;
      const POST_RESET_BUFFER_SECONDS = 30; // pastikan pairing reset dieksekusi sebelum pesan wave berikutnya

      const windowStartMinutes = sh * 60 + sm;
      const windowEndMinutes = eh * 60 + em;
      const windowMinutesPerDay = windowEndMinutes >= windowStartMinutes
        ? windowEndMinutes - windowStartMinutes
        : (24 * 60 - windowStartMinutes) + windowEndMinutes;

      function normalizeToWindow(dt: DateTime): DateTime {
        // Assumption: typical window where end > start (e.g. 08:00-22:00).
        // We still handle overnight windows in a best-effort way.
        let t = dt.setZone(tz);
        let start = t.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        let end = t.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
        if (end <= start) {
          // overnight window
          if (t < start) start = start.minus({ days: 1 });
          end = start.plus({ minutes: windowMinutesPerDay });
        }

        if (t < start) return start;
        if (t >= end) return start.plus({ days: 1 });
        return t;
      }

      const totalWindowSecondsCampaign = Math.max(1, TOTAL_WINDOWS * windowMinutesPerDay * 60);
      const totalPairsPerWave = orderedTargets.length; // jumlah NEW targets
      const totalMessageTasksPerWave = MESSAGES_PER_WAVE * totalPairsPerWave * 2; // OLD+NEW
      const totalResetTasks = Math.max(0, TOTAL_WAVES - 1);
      const totalTasksCampaign = totalResetTasks + (TOTAL_WAVES * totalMessageTasksPerWave);
      // No fixed minimum pacing (previously clamped to BASE_DELAY_MINUTES=1).
      // Keep a tiny guard so we don't generate identical timestamps.
      const delayBetweenTasksSeconds = Math.max(
        1,
        Math.floor((totalWindowSecondsCampaign / Math.max(1, totalTasksCampaign)) * 0.85)
      );

      console.log(
        `📅 Campaign schedule: ${TOTAL_WAVES} waves, ${TOTAL_WINDOWS}x window total, ` +
        `${MESSAGES_PER_WAVE} msg/arah/pair/wave (OLD+NEW), delay ~${Math.round(delayBetweenTasksSeconds / 60)} min/task, window ${cfg.windowStart}-${cfg.windowEnd}`
      );

      // Group targets by their assigned OLD session for Wave 1 (initial assignment)
      const targetsByOld: Record<string, string[]> = {};
      for (const [newChatId, oldSessionName] of Object.entries(assignedOldByNewChatId)) {
        if (!targetsByOld[oldSessionName]) targetsByOld[oldSessionName] = [];
        targetsByOld[oldSessionName].push(newChatId);
      }

      // Validate: Ensure all targets have OLD assignment
      const unassignedTargets = orderedTargets.filter(t => !assignedOldByNewChatId[t]);
      if (unassignedTargets.length > 0) {
        console.error(`❌ ${unassignedTargets.length} targets not assigned to OLD:`, unassignedTargets);
        return res.status(500).json({ error: 'Target assignment failed', unassignedTargets });
      }

      // Build full pairing map (all NEW → their assigned OLD chatId)
      const fullPairingMap: Record<string, string> = {};
      const unmappedNewSessions: string[] = [];

      for (const [newChatId, oldSessionName] of Object.entries(assignedOldByNewChatId)) {
        const oldChatId = oldSessionChatIds[oldSessionName];
        if (!oldChatId) {
          console.error(`❌ OLD session ${oldSessionName} missing chatId, skipping targets`);
          continue;
        }

        const newSessionName =
          newChatIdToNewSession[newChatId] ||
          newSessionFallbackMap[newChatId] ||
          newSessions[0]?.wahaSession;

        if (!newSessionName) {
          console.error(`❌ NEW target ${newChatId} has no session mapping`);
          unmappedNewSessions.push(newChatId);
          continue;
        }

        fullPairingMap[newSessionName] = oldChatId;
        console.log(`  ✅ Pair: ${newSessionName} → ${oldSessionName} (${oldChatId})`);
      }

      if (unmappedNewSessions.length > 0) {
        console.error(`❌ ${unmappedNewSessions.length} NEW targets have no session mapping`);
        return res.status(500).json({ error: 'NEW session mapping failed', unmappedNewSessions });
      }

      // Set initial pairing
      db.replaceNewPairings(fullPairingMap);
      console.log(`🔗 Pairing set: ${Object.keys(fullPairingMap).length} NEW sessions paired`);

      // Generate tasks: Multi-wave rotation schedule
      // Wave structure: OLD sessions rotate through NEW pairs
      // Example with 5 OLD and 10 NEW (2 per OLD):
      // Wave 1: OLD-1→NEW-2,3 | OLD-2→NEW-4,5 | OLD-3→NEW-6,7 | OLD-4→NEW-8,9 | OLD-5→NEW-10,11
      // Wave 2: OLD-1→NEW-4,5 | OLD-2→NEW-6,7 | OLD-3→NEW-8,9 | OLD-4→NEW-10,11 | OLD-5→NEW-2,3 (rotasi)
      // Wave 3: OLD-1→NEW-6,7 | OLD-2→NEW-8,9 | dst...
      // dst sampai 5 waves (sebanyak OLD sessions)

      const initialDelaySeconds = 14 + Math.floor(Math.random() * 7);
      let globalTaskTime = normalizeToWindow(now.plus({ seconds: initialDelaySeconds }));

      // For each wave
      for (let waveIndex = 0; waveIndex < TOTAL_WAVES; waveIndex++) {
        console.log(`\n🌊 === WAVE ${waveIndex + 1}/${TOTAL_WAVES} ===`);

        // Calculate rotated assignment for this wave
        // Rotation formula: OLD at index i gets targets from OLD at index (i + waveIndex) % TOTAL_OLD
        const waveAssignment: Record<string, { oldSessionName: string; newTargets: string[] }> = {};

        for (let oldIdx = 0; oldIdx < oldSessions.length; oldIdx++) {
          const currentOld = oldSessions[oldIdx];
          // Get targets from the OLD session at rotated position
          const sourceOldIdx = (oldIdx + waveIndex) % oldSessions.length;
          const sourceOld = oldSessions[sourceOldIdx];
          const targets = targetsByOld[sourceOld.wahaSession] || [];

          waveAssignment[currentOld.wahaSession] = {
            oldSessionName: currentOld.wahaSession,
            newTargets: targets,
          };

          console.log(`   ${currentOld.wahaSession} → ${targets.length} targets (from ${sourceOld.wahaSession})`);
        }

        // Build pairing map for this wave
        const wavePairingMap: Record<string, string> = {};
        for (const [oldSessionName, assignment] of Object.entries(waveAssignment)) {
          const oldChatId = oldSessionChatIds[oldSessionName];
          if (!oldChatId) continue;

          for (const newChatId of assignment.newTargets) {
            const newSessionName =
              newChatIdToNewSession[newChatId] ||
              newSessionFallbackMap[newChatId] ||
              newSessions[0]?.wahaSession;

            if (newSessionName) {
              wavePairingMap[newSessionName] = oldChatId;
            }
          }
        }

        // Schedule pairing update task at start of wave (except wave 1, already set above)
        if (waveIndex > 0) {
          tasks.push({
            id: randomUUID(),
            automationId,
            dueAt: globalTaskTime.toUTC().toISO()!,
            chatId: 'system',
            kind: 'wa12-wave-reset',
            status: 'pending',
            waveIndex,
            payload: { pairings: wavePairingMap },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Small buffer after pairing update before messages start
          globalTaskTime = globalTaskTime.plus({ seconds: POST_RESET_BUFFER_SECONDS });

          // CRITICAL FIX: OLD must send first message to NEW after pairing change
          // This "opens" the conversation so NEW can safely reply
          console.log(`   🔄 Wave ${waveIndex + 1}: Scheduling OLD→NEW init messages (OLD sends first)`);

          for (const oldSession of oldSessions) {
            const oldSessionName = oldSession.wahaSession;
            const assignment = waveAssignment[oldSessionName];
            if (!assignment || assignment.newTargets.length === 0) continue;

            for (const newChatId of assignment.newTargets) {
              globalTaskTime = normalizeToWindow(globalTaskTime);

              // OLD sends FIRST to NEW to open conversation
              tasks.push({
                id: randomUUID(),
                automationId,
                dueAt: globalTaskTime.toUTC().toISO()!,
                chatId: newChatId,
                senderSession: oldSessionName,
                kind: 'script-next',
                status: 'pending',
                waveIndex,
                dayIndex: 0,
                roundIndex: -1, // Special "init" round
                isWaveInit: true, // Mark as wave initialization
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });

              globalTaskTime = globalTaskTime.plus({ seconds: delayBetweenTasksSeconds });
            }
          }

          // Extra buffer after init messages before normal rounds start
          globalTaskTime = globalTaskTime.plus({ seconds: POST_RESET_BUFFER_SECONDS * 2 });
        }

        // Generate tasks for this wave:
        // - Exactly MESSAGES_PER_WAVE rounds per pair (OLD→NEW then NEW→OLD)
        // - Uses campaign-level pacing so ALL waves fit within TOTAL_WINDOWS windows
        const allNewTargetsInWave = Object.values(waveAssignment).reduce((sum, a) => sum + a.newTargets.length, 0);
        const totalTasksInWave = MESSAGES_PER_WAVE * allNewTargetsInWave * 2; // OLD+NEW
        console.log(
          `   ⏱️  Wave pacing: ${allNewTargetsInWave} pairs, ${totalTasksInWave} tasks, delay ~${Math.round(delayBetweenTasksSeconds / 60)} min/task`
        );

        let taskTime = normalizeToWindow(globalTaskTime);
        const waveDay0 = taskTime.startOf('day');

        for (let roundIndex = 0; roundIndex < MESSAGES_PER_WAVE; roundIndex++) {
          for (const oldSession of oldSessions) {
            const oldSessionName = oldSession.wahaSession;
            const assignment = waveAssignment[oldSessionName];
            if (!assignment || assignment.newTargets.length === 0) continue;

            const oldChatId = oldSessionChatIds[oldSessionName];
            if (!oldChatId) continue;

            for (const newChatId of assignment.newTargets) {
              const newSessionName =
                newChatIdToNewSession[newChatId] ||
                newSessionFallbackMap[newChatId] ||
                newSessions[0]?.wahaSession;

              if (!newSessionName) {
                console.error(`❌ Skipping: newChatId=${newChatId} has no session`);
                continue;
              }

              taskTime = normalizeToWindow(taskTime);
              const dayOffset = Math.max(0, Math.floor(taskTime.startOf('day').diff(waveDay0, 'days').days));
              const absoluteDay = dayOffset;

              // OLD → NEW
              tasks.push({
                id: randomUUID(),
                automationId,
                dueAt: taskTime.toUTC().toISO()!,
                chatId: newChatId,
                senderSession: oldSessionName,
                kind: 'script-next',
                status: 'pending',
                waveIndex,
                dayIndex: absoluteDay,
                roundIndex,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });

              taskTime = taskTime.plus({ seconds: delayBetweenTasksSeconds });

              taskTime = normalizeToWindow(taskTime);
              const dayOffset2 = Math.max(0, Math.floor(taskTime.startOf('day').diff(waveDay0, 'days').days));
              const absoluteDay2 = dayOffset2;

              // NEW → OLD
              tasks.push({
                id: randomUUID(),
                automationId,
                dueAt: taskTime.toUTC().toISO()!,
                chatId: oldChatId,
                senderSession: newSessionName,
                kind: 'script-next',
                status: 'pending',
                waveIndex,
                dayIndex: absoluteDay2,
                roundIndex,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });

              taskTime = taskTime.plus({ seconds: delayBetweenTasksSeconds });
            }
          }
        }

        // Continue immediately to next wave (no extra gap)
        globalTaskTime = normalizeToWindow(taskTime);

        const waveTasks = tasks.filter((t: any) => t.waveIndex === waveIndex && t.kind !== 'wa12-wave-reset');
        console.log(`   ✅ Wave ${waveIndex + 1} complete: ${waveTasks.length} tasks, next wave starts at ${globalTaskTime.toLocaleString()}`);
      }

      console.log(`\n📊 Total scheduled tasks: ${tasks.length} (${TOTAL_WAVES} waves × ${MESSAGES_PER_WAVE * 2} messages/wave × ${orderedTargets.length / oldSessions.length} pairs/OLD)`);


      // Show first 3 task due times for debugging
      const sortedTasks = [...tasks].sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
      console.log(`📅 First 3 tasks due at:`);
      for (let i = 0; i < Math.min(3, sortedTasks.length); i++) {
        const task = sortedTasks[i];
        const dueTime = DateTime.fromISO(String(task.dueAt), { zone: 'utc' }).setZone(tz);
        console.log(`   ${i + 1}. ${dueTime.toLocaleString(DateTime.DATETIME_SHORT)} - ${task.senderSession} → ${task.chatId.substring(0, 12)}...`);
      }

      db.replaceScheduledTasksForAutomation(automationId, tasks);

      // Keep NEW webhook suppressed until the last scheduled task is done (+1 hour)
      let maxDueAt: string | null = null;
      for (const t of tasks) {
        if (!maxDueAt || String(t.dueAt) > maxDueAt) maxDueAt = String(t.dueAt);
      }
      if (maxDueAt) {
        const until = DateTime.fromISO(maxDueAt, { zone: 'utc' }).plus({ hours: 1 }).toUTC().toISO()!;
        db.setSuppressNewAutoReplyUntil(until);
      } else {
        db.setSuppressNewAutoReplyUntil(null);
      }

      console.log(`🎉 Campaign ${automationId} fully initialized: ${tasks.length} wave tasks scheduled`);
    } catch (error: any) {
      console.error(`❌ Campaign ${automationId} background initialization failed:`, error);
      // Mark automation as failed
      db.upsertAutomation({
        ...automation,
        active: false,
        updatedAt: new Date().toISOString(),
      });
    }
  })(); // Run in background, don't await
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

app.get('/automations/:id/progress', requireAuth, (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing automation id' });

  const automation = db.getAutomationById(id);
  if (!automation) return res.status(404).json({ error: 'Not found' });

  const summary = db.getAutomationProgressSummary(id);
  return res.json({ ok: true, automation, summary });
});

app.post('/automations/:id/stop', requireAuth, (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing automation id' });

  const automation = db.getAutomationById(id);
  if (!automation) return res.status(404).json({ error: 'Not found' });

  const updated = db.upsertAutomation({
    ...automation,
    active: false,
    updatedAt: new Date().toISOString(),
  });

  const canceled = db.cancelPendingScheduledTasksForAutomation(id, 'stopped');

  // Safety: if we were suppressing NEW webhook for this run, stop should release it.
  db.setSuppressNewAutoReplyUntil(null);

  const summary = db.getAutomationProgressSummary(id);
  return res.json({ ok: true, automation: updated, canceled, summary });
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

    // If this exact sender+chat is already handled by scheduled tasks, don't double-send via webhook.
    // This keeps orchestrated runs deterministic.
    if (db.hasPendingScheduledTaskForSenderChat(config.wahaSession, String(chatId), 24 * 60 * 60 * 1000)) {
      debug('ignored:has_pending_scheduled_task', { session, chatId });
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Safety: NEW sessions allow-first-contact with an OLD.
    // - If NEW has no stored paired OLD, bind to the first inbound OLD chatId.
    // - After bound, NEW only replies to that OLD chatId.
    if ((config.cluster || 'old') === 'new') {
      const suppressUntilIso = db.getSuppressNewAutoReplyUntil();
      if (suppressUntilIso) {
        const until = DateTime.fromISO(String(suppressUntilIso), { zone: 'utc' });
        if (until.isValid && DateTime.now().toUTC() < until) {
          debug('ignored:new_suppressed_by_phase', { session, chatId, suppressUntilIso });
          return res.status(200).json({ ok: true, ignored: true });
        }
      }

      const map = await getSessionToChatIdMapCached();
      const chatIdToSession: Record<string, string> = {};
      for (const [name, cid] of Object.entries(map)) {
        if (cid) chatIdToSession[String(cid)] = String(name);
      }

      const inboundSessionName = chatIdToSession[String(chatId)] || '';
      const inboundIsOld = /^old-(\d+)$/i.test(inboundSessionName);

      // NEW sessions should only participate in conversations with OLD sessions.
      // This prevents NEW auto-replying to other NEW sessions / external chats.
      if (!inboundIsOld) {
        debug('ignored:new_inbound_not_old', { session, chatId, inboundSessionName });
        return res.status(200).json({ ok: true, ignored: true });
      }

      // Only enforce pairing when talking to known OLD sessions.
      const existingPair = db.getNewPairedOldChatId(config.wahaSession);
      if (!existingPair) {
        db.setNewPairedOldChatId(config.wahaSession, String(chatId));
        debug('paired:new_first_contact', { session, chatId, inboundSessionName });
      } else if (String(chatId) !== String(existingPair)) {
        debug('ignored:new_not_paired_old', { session, chatId, inboundSessionName, pairedOldChatId: existingPair });
        return res.status(200).json({ ok: true, ignored: true });
      }
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
