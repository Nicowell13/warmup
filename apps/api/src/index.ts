import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';

import { db } from './db.js';
import { requireAuth, signToken, verifyAdminPassword } from './auth.js';
import { wahaDeleteSession, wahaGetQrBase64, wahaJoinGroup, wahaListSessions, wahaRequestPairingCode, wahaStartSession, wahaSendText } from './waha.js';
import { pickRandom, pickReplyFromScript, getRandomStartLine } from './script.js';
import { startScheduler } from './scheduler.js';
import { WA12_PRESET } from './presets/wa12Preset.js';
import { sendTextQueued } from './sendQueue.js';

// Global declaration for pending replies lock
declare global {
  var pendingReplies: Set<string> | undefined;
}

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

// Normalisasi nama session ke format preset (old-1, new-2) agar lookup script OLD konsisten.
function normalizePresetSessionName(name: string): string {
  if (!name || !name.trim()) return name;
  const m = name.trim().match(/^old[-_]?(\d+)$/i);
  if (m) return `old-${m[1]}`;
  const m2 = name.trim().match(/^new[-_]?(\d+)$/i);
  if (m2) return `new-${m2[1]}`;
  return name;
}

// Webhook URL untuk WAHA: harus reachable dari container/process WAHA (e.g. http://app-api:4000/waha/webhook).
// Set di env agar setiap session (termasuk NEW) dapat kirim event message ke API.
const WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL || 'http://localhost:4000/waha/webhook';

function buildWahaSessionConfig(overrides?: { noweb?: any }) {
  const base: any = {
    noweb: {
      store: { enabled: true, fullSync: true },
    },
    ...overrides,
  };
  if (WAHA_WEBHOOK_URL) {
    base.webhooks = [
      { url: WAHA_WEBHOOK_URL, events: ['message', 'message.any', 'message.ack'] },
    ];
  }
  return base;
}

app.post('/waha/sessions/:session/start', requireAuth, async (req, res) => {
  try {
    const config = buildWahaSessionConfig();
    const data = await wahaStartSession(String(req.params.session), config);
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
    const sessionScript =
      WA12_PRESET.scripts && WA12_PRESET.scripts[item.name]
        ? WA12_PRESET.scripts[item.name]
        : WA12_PRESET.scriptText;

    const existing = db.getSessionByName(item.name);
    if (existing) {
      const updated = db.upsertSession({
        ...existing,
        cluster: item.cluster,
        autoReplyEnabled: true,
        autoReplyMode: 'script',
        scriptLineParity: item.cluster === 'new' ? WA12_PRESET.newScriptLineParity : WA12_PRESET.oldScriptLineParity,
        autoReplyScriptText: sessionScript,
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
      autoReplyScriptText: sessionScript,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    createdCount += 1;
    upserted.push(created);

    // Auto-start session with NOWEB store + webhook agar incoming message trigger API
    const nowebConfig = buildWahaSessionConfig({
      noweb: { store: { enabled: true, full_sync: true } },
    });

    // Fire and forget start
    wahaStartSession(item.name, nowebConfig)
      .then(() => console.log(`   ✅ Started WAHA session: ${item.name} (NOWEB store enabled)`))
      .catch((err: any) => console.error(`   ❌ Failed to start WAHA session ${item.name}:`, err.message));
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

  // Log which OLD sessions are used vs excluded (so user knows why only some are "active")
  const usedOldNames = oldSessions.map((s) => s.wahaSession);
  console.log(`✅ OLD sessions dipakai campaign (${usedOldNames.length}): ${usedOldNames.join(', ') || '(none)'}`);
  for (const name of requestedOldSessionNames) {
    if (usedOldNames.includes(name)) continue;
    const session = db.getSessionByName(name);
    let reason: string;
    if (!session) reason = 'tidak ada di database';
    else if (session.cluster !== 'old') reason = 'bukan cluster old';
    else if (!connectedSessionNames.includes(name)) reason = 'tidak terhubung di WAHA / tidak ada chatId (pastikan session scan QR & punya nomor)';
    else if (!(session.autoReplyScriptText || '').trim().length) reason = 'script kosong (isi Auto-reply script di pengaturan session)';
    else reason = 'tidak memenuhi filter';
    console.warn(`⚠️ OLD session dikecualikan: ${name} → ${reason}`);
  }

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
    waves: 1, // Single wave - all OLD talk to all NEW
  });

  // 6) Run campaign blast + wave generation in background
  (async () => {
    try {
      console.log(`🚀 Starting campaign ${automationId}: ${orderedTargets.length} targets, 1 wave (all-to-all)`);

      // Suppress NEW auto-replies? NO.
      // We want NEW sessions to reply IMMEDIATELY via webhook (Reactive Worker).
      // So we do NOT suppress auto-replies.
      db.setSuppressNewAutoReplyUntil(null);

      // Generate random start lines for each session (Interleaved Round-Robin feature)
      // OLD sessions use odd parity, NEW sessions use even parity
      const sessionRandomStartLines: Record<string, number> = {};
      for (const oldSession of oldSessions) {
        const parity = oldSession.scriptLineParity || 'odd';
        const randomStart = getRandomStartLine(oldSession.autoReplyScriptText || '', parity);
        sessionRandomStartLines[oldSession.wahaSession] = randomStart;
        console.log(`   🎲 ${oldSession.wahaSession} random start: line ${randomStart + 1} (parity: ${parity})`);
      }
      for (const newSession of newSessions) {
        const parity = newSession.scriptLineParity || 'even';
        const randomStart = getRandomStartLine(newSession.autoReplyScriptText || '', parity);
        sessionRandomStartLines[newSession.wahaSession] = randomStart;
        console.log(`   🎲 ${newSession.wahaSession} random start: line ${randomStart + 1} (parity: ${parity})`);
      }

      // Campaign initial send: OLD sends first to each NEW target (shuffled for natural pattern)
      const campaignResults: Array<{ chatId: string; fromSession: string; ok: boolean; error?: string }> = [];

      // Build initial pairs and shuffle for random order
      const initialPairs: Array<{ oldSession: typeof oldSessions[0]; chatId: string }> = [];
      const targetsPerOld = Math.ceil(orderedTargets.length / oldSessions.length);
      for (let i = 0; i < orderedTargets.length; i++) {
        const oldIdx = Math.floor(i / targetsPerOld) % oldSessions.length;
        initialPairs.push({
          oldSession: oldSessions[oldIdx],
          chatId: orderedTargets[i],
        });
      }

      // Shuffle initial pairs for random order
      for (let i = initialPairs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [initialPairs[i], initialPairs[j]] = [initialPairs[j], initialPairs[i]];
      }

      // Send in shuffled order
      for (const { oldSession, chatId } of initialPairs) {
        const oldSessionName = oldSession.wahaSession;

        try {
          const parity = oldSession.scriptLineParity || 'odd';
          const startLine = sessionRandomStartLines[oldSessionName] || 0;
          const picked = pickReplyFromScript(oldSession.autoReplyScriptText || '', 0, startLine, parity);
          if (!picked) {
            campaignResults.push({ chatId, fromSession: oldSession.wahaSession, ok: false, error: 'Script kosong/tidak valid' });
            continue;
          }

          await sendTextQueued({ session: oldSession.wahaSession, chatId: String(chatId), text: picked.text });
          db.setChatProgress(oldSession.wahaSession, String(chatId), {
            seasonIndex: picked.nextSeasonIndex,
            lineIndex: picked.nextLineIndex,
            messageCount: 1, // Initial count
            lastOldIndex: oldSessions.indexOf(oldSession),
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

      // Campaign Configuration
      const TOTAL_WINDOWS = Number(process.env.TOTAL_WINDOWS || 1); // Selesai dalam 1 window (~12 jam)
      const MESSAGES_PER_WAVE = Number(process.env.MESSAGES_PER_WAVE || 10); // 10 round percakapan
      const TOTAL_WAVES = 1; // Single wave - all OLD talk to all NEW
      const BASE_DELAY_MINUTES = 1;

      const windowStartMinutes = sh * 60 + sm;
      const windowEndMinutes = eh * 60 + em;
      const windowMinutesPerDay = windowEndMinutes >= windowStartMinutes
        ? windowEndMinutes - windowStartMinutes
        : (24 * 60 - windowStartMinutes) + windowEndMinutes;

      function normalizeToWindow(dt: DateTime): DateTime {
        let t = dt.setZone(tz);
        let start = t.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        let end = t.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
        if (end <= start) {
          if (t < start) start = start.minus({ days: 1 });
          end = start.plus({ minutes: windowMinutesPerDay });
        }
        if (t < start) return start;
        if (t >= end) return start.plus({ days: 1 });
        return t;
      }

      // Fisher-Yates shuffle for random order
      function shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      }

      // Build ALL OLD→NEW pairs (every OLD talks to every NEW)
      const allPairs: Array<{
        oldSessionName: string;
        oldChatId: string;
        newChatId: string;
        newSessionName: string;
      }> = [];

      for (const oldSession of oldSessions) {
        const oldSessionName = oldSession.wahaSession;
        const oldChatId = oldSessionChatIds[oldSessionName];
        if (!oldChatId) continue;

        for (let rawNewChatId of orderedTargets) {
          // Standardize JID (append @c.us if missing and numeric)
          let newChatId = String(rawNewChatId);
          if (!newChatId.endsWith('@c.us') && !newChatId.endsWith('@g.us')) {
            if (/^\d+$/.test(newChatId)) {
              newChatId = `${newChatId}@c.us`;
            } else {
              console.log(`   ⚠️ Skipped invalid JID format: ${newChatId}`);
              continue;
            }
          }

          // Validation: Prevent self-messaging and ensure valid target
          if (!newChatId || newChatId === oldChatId) {
            console.log(`   ⚠️ Skipped invalid/self target: ${oldSessionName} -> ${newChatId}`);
            continue;
          }
          // Ensure target is a personal JID (to avoid group/broadcast JIDs)
          if (!newChatId.endsWith('@c.us')) {
            console.log(`   ⚠️ Skipped non-personal JID: ${newChatId}`);
            continue;
          }

          const newSessionName =
            newChatIdToNewSession[newChatId] ||
            newSessionFallbackMap[newChatId];

          if (!newSessionName) {
            console.log(`   ❌ No session mapping found for target ${newChatId} (skipping)`);
            continue;
          }

          // Debug log to verify correct pairing
          // console.log(`   🔍 Pair Debug: OLD=${oldSessionName} (${oldChatId}) -> NEW=${newSessionName} (${newChatId})`);

          allPairs.push({
            oldSessionName,
            oldChatId,
            newChatId,
            newSessionName,
          });
        }
      }

      console.log(`🔗 Total pairs: ${allPairs.length} (${oldSessions.length} OLD × ${orderedTargets.length} NEW)`);

      // Calculate pacing
      // Re-calculated: We only schedule OLD -> NEW tasks. NEW -> OLD is via Webhook (Reactive).
      // So tasks count is halved relative to total interactions.
      const totalTasksCampaign = allPairs.length * MESSAGES_PER_WAVE; // Only OLD -> NEW scheduled
      const totalWindowSecondsCampaign = Math.max(1, TOTAL_WINDOWS * windowMinutesPerDay * 60);
      const delayBetweenTasksSeconds = Math.max(
        1,
        Math.floor((totalWindowSecondsCampaign / Math.max(1, totalTasksCampaign)) * 0.85)
      );

      console.log(
        `📅 Campaign schedule: 1 wave (all-to-all), ${TOTAL_WINDOWS}x window total, ` +
        `${MESSAGES_PER_WAVE} msg/pair, delay ~${Math.round(delayBetweenTasksSeconds / 60)} min/task, window ${cfg.windowStart}-${cfg.windowEnd}`
      );

      // Build pairing map for all NEW→OLD (every NEW can reply to any OLD)
      const fullPairingMap: Record<string, string> = {};
      for (const pair of allPairs) {
        // Each NEW session maps to ONE OLD for reply purposes
        // We'll use the first encountered pairing
        if (!fullPairingMap[pair.newSessionName]) {
          fullPairingMap[pair.newSessionName] = pair.oldChatId;
          console.log(`  ✅ Pair: ${pair.newSessionName} → ${pair.oldSessionName} (${pair.oldChatId})`);
        }
      }

      db.replaceNewPairings(fullPairingMap);
      console.log(`🔗 Pairing set: ${Object.keys(fullPairingMap).length} NEW sessions paired`);

      // Generate tasks with random order per round
      const initialDelaySeconds = 14 + Math.floor(Math.random() * 7);
      let taskTime = normalizeToWindow(now.plus({ seconds: initialDelaySeconds }));
      const day0 = taskTime.startOf('day');

      console.log(`\n🌊 === SINGLE WAVE (ALL-TO-ALL, RANDOM ORDER, REACTIVE NEW) ===`);
      console.log(`   📊 ${allPairs.length} pairs × ${MESSAGES_PER_WAVE} rounds × 1 direction (OLD->NEW) = ${totalTasksCampaign} tasks`);

      for (let roundIndex = 0; roundIndex < MESSAGES_PER_WAVE; roundIndex++) {
        // Shuffle pairs for random order each round
        const shuffledPairs = shuffleArray(allPairs);

        console.log(`   📨 Round ${roundIndex + 1}: ${shuffledPairs.length} OLD→NEW pairs (shuffled)`);

        // OLD → NEW (all pairs, shuffled order)
        for (const pair of shuffledPairs) {
          taskTime = normalizeToWindow(taskTime);
          const dayOffset = Math.max(0, Math.floor(taskTime.startOf('day').diff(day0, 'days').days));

          tasks.push({
            id: randomUUID(),
            automationId,
            dueAt: taskTime.toUTC().toISO()!,
            chatId: pair.newChatId,
            senderSession: pair.oldSessionName,
            kind: 'script-next',
            status: 'pending',
            waveIndex: 0,
            dayIndex: dayOffset,
            roundIndex,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Delay includes time for the NEW reply (webhook) to happen naturally
          // We assume webhook reply happens "instantly" after OLD message is received.
          // Spacing is mainly for OLD not to blast too fast.
          taskTime = taskTime.plus({ seconds: delayBetweenTasksSeconds });
        }

        // REMOVED: NEW → OLD loop. This is now handled by Webhook.
      }

      console.log(`   ✅ Campaign complete: ${tasks.length} total tasks scheduled`);
      console.log(`\n📊 Total scheduled tasks: ${tasks.length} (${allPairs.length} pairs × ${MESSAGES_PER_WAVE} rounds × 2 directions)`);


      // Show first 3 task due times for debugging
      const sortedTasks = [...tasks].sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
      console.log(`📅 First 3 tasks due at:`);
      for (let i = 0; i < Math.min(3, sortedTasks.length); i++) {
        const task = sortedTasks[i];
        const dueTime = DateTime.fromISO(String(task.dueAt), { zone: 'utc' }).setZone(tz);
        console.log(`   ${i + 1}. ${dueTime.toLocaleString(DateTime.DATETIME_SHORT)} - ${task.senderSession} → ${task.chatId.substring(0, 12)}...`);
      }

      db.replaceScheduledTasksForAutomation(automationId, tasks);

      // Suppress NEW auto-replies? NO.
      // We want NEW sessions to reply IMMEDIATELY via webhook (Reactive Worker).
      // So we do NOT suppress auto-replies.
      db.setSuppressNewAutoReplyUntil(null);

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

// ===== GROUP FEATURE ENDPOINTS =====

// Helper: Extract invite code from WhatsApp group link
function extractInviteCode(inviteLink: string): string | null {
  // Supports: https://chat.whatsapp.com/xxx or just xxx
  const match = inviteLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
  if (match) return match[1];
  // If no URL pattern, maybe it's just the code
  if (/^[A-Za-z0-9]{10,}$/.test(inviteLink.trim())) {
    return inviteLink.trim();
  }
  return null;
}

// List all groups
app.get('/groups', requireAuth, (_req, res) => {
  const groups = db.listGroups();
  // Add join stats for each group
  const groupsWithStats = groups.map((g) => {
    const joins = db.listGroupJoins(g.id);
    return {
      ...g,
      stats: {
        total: joins.length,
        joined: joins.filter((j) => j.status === 'joined').length,
        pending: joins.filter((j) => j.status === 'pending' || j.status === 'joining').length,
        failed: joins.filter((j) => j.status === 'failed').length,
      },
    };
  });
  return res.json({ groups: groupsWithStats });
});

// Create a new group
app.post('/groups', requireAuth, (req, res) => {
  const bodySchema = z.object({
    name: z.string().min(1).max(100),
    inviteLink: z.string().min(1),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const inviteCode = extractInviteCode(parsed.data.inviteLink);
  if (!inviteCode) {
    return res.status(400).json({ error: 'Invalid invite link format. Expected: https://chat.whatsapp.com/xxx or invite code' });
  }

  const group = db.createGroup({
    id: randomUUID(),
    name: parsed.data.name,
    inviteLink: parsed.data.inviteLink,
    inviteCode,
  });

  return res.status(201).json({ group });
});

// Get all NEW sessions for group join
app.get('/groups/eligible-sessions', requireAuth, (_req, res) => {
  const eligible = db.getEligibleNewSessions();
  return res.json({ eligibleSessions: eligible });
});

// Get group details
app.get('/groups/:id', requireAuth, (req, res) => {
  const group = db.getGroupById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  const joins = db.listGroupJoins(group.id);
  return res.json({ group, joins });
});

// Delete a group
app.delete('/groups/:id', requireAuth, (req, res) => {
  const ok = db.deleteGroup(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: 'Group not found' });
  }
  return res.status(204).send();
});

// List joins for a specific group
app.get('/groups/:id/joins', requireAuth, (req, res) => {
  const group = db.getGroupById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  const joins = db.listGroupJoins(group.id);
  return res.json({ joins });
});

// Trigger join for selected sessions
app.post('/groups/:id/join', requireAuth, async (req, res) => {
  const group = db.getGroupById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const bodySchema = z.object({
    sessions: z.array(z.object({
      sessionName: z.string().min(1),
      chatId: z.string().min(1),
    })).min(1),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  // Create pending join records
  const joinRecords: Array<{ id: string; sessionName: string; chatId: string }> = [];
  for (const session of parsed.data.sessions) {
    // Check if already joined
    if (db.hasSessionJoinedGroup(group.id, session.sessionName)) {
      continue; // Skip already joined
    }

    const joinId = randomUUID();
    db.upsertGroupJoin({
      id: joinId,
      groupId: group.id,
      sessionName: session.sessionName,
      chatId: session.chatId,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    joinRecords.push({ id: joinId, sessionName: session.sessionName, chatId: session.chatId });
  }

  // Process joins in background with delay between each
  (async () => {
    console.log(`🔗 Starting group join for ${joinRecords.length} sessions to group "${group.name}"`);

    for (let i = 0; i < joinRecords.length; i++) {
      const record = joinRecords[i];
      const join = db.getGroupJoinById(record.id);
      if (!join) continue;

      // Update status to joining
      db.upsertGroupJoin({ ...join, status: 'joining' });
      console.log(`  [${i + 1}/${joinRecords.length}] Joining: ${record.sessionName}`);

      // Try to join (with retry up to 3 times)
      let success = false;
      let lastError = '';
      let retryCount = join.retryCount || 0;

      while (!success && retryCount < 3) {
        const result = await wahaJoinGroup(record.sessionName, group.inviteCode);

        if (result.ok) {
          success = true;
          db.upsertGroupJoin({
            ...join,
            status: 'joined',
            retryCount,
            joinedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          console.log(`    ✅ Joined successfully`);
        } else {
          retryCount++;
          lastError = result.error || 'Unknown error';
          console.log(`    ❌ Attempt ${retryCount}/3 failed: ${lastError}`);

          if (retryCount < 3) {
            // Wait 10-15 seconds before retry
            const retryDelay = 10000 + Math.random() * 5000;
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!success) {
        db.upsertGroupJoin({
          ...join,
          status: 'failed',
          retryCount,
          errorMessage: lastError,
          updatedAt: new Date().toISOString(),
        });
        console.log(`    ❌ Failed after 3 attempts`);
      }

      // Delay 10-15 seconds before next session (variative)
      if (i < joinRecords.length - 1) {
        const delay = 10000 + Math.random() * 5000;
        console.log(`    ⏳ Waiting ${Math.round(delay / 1000)}s before next...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    console.log(`🔗 Group join completed for "${group.name}"`);
  })(); // Run in background

  return res.json({
    ok: true,
    message: `Join process started for ${joinRecords.length} sessions. Check status via GET /groups/${group.id}/joins`,
    queued: joinRecords.length,
    skippedAlreadyJoined: parsed.data.sessions.length - joinRecords.length,
  });
});

// Retry failed joins for a group
app.post('/groups/:id/retry', requireAuth, async (req, res) => {
  const group = db.getGroupById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  // Get failed joins that can be retried
  const failedJoins = db.listGroupJoins(group.id).filter((j) => j.status === 'failed' && j.retryCount < 3);

  if (failedJoins.length === 0) {
    return res.json({ ok: true, message: 'No failed joins to retry', retriedCount: 0 });
  }

  // Reset status to pending for retry
  for (const join of failedJoins) {
    db.upsertGroupJoin({
      ...join,
      status: 'pending',
      updatedAt: new Date().toISOString(),
    });
  }

  // Process retries in background (similar to join)
  (async () => {
    console.log(`🔄 Retrying ${failedJoins.length} failed joins for group "${group.name}"`);

    for (let i = 0; i < failedJoins.length; i++) {
      const join = db.getGroupJoinById(failedJoins[i].id);
      if (!join || join.status !== 'pending') continue;

      db.upsertGroupJoin({ ...join, status: 'joining' });
      console.log(`  [${i + 1}/${failedJoins.length}] Retrying: ${join.sessionName}`);

      const result = await wahaJoinGroup(join.sessionName, group.inviteCode);

      if (result.ok) {
        db.upsertGroupJoin({
          ...join,
          status: 'joined',
          retryCount: join.retryCount + 1,
          joinedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.log(`    ✅ Joined successfully on retry`);
      } else {
        db.upsertGroupJoin({
          ...join,
          status: 'failed',
          retryCount: join.retryCount + 1,
          errorMessage: result.error || 'Unknown error',
          updatedAt: new Date().toISOString(),
        });
        console.log(`    ❌ Retry failed: ${result.error}`);
      }

      // Delay 10-15 seconds before next
      if (i < failedJoins.length - 1) {
        const delay = 10000 + Math.random() * 5000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    console.log(`🔄 Retry completed for group "${group.name}"`);
  })();

  return res.json({
    ok: true,
    message: `Retry started for ${failedJoins.length} failed joins`,
    retriedCount: failedJoins.length,
  });
});

// Join ALL sessions to ALL groups at once
app.post('/groups/join-all', requireAuth, async (_req, res) => {
  const groups = db.listGroups();
  const allNewSessions = db.getEligibleNewSessions();

  if (groups.length === 0) {
    return res.status(400).json({ error: 'Tidak ada group. Tambahkan group terlebih dahulu.' });
  }
  if (allNewSessions.length === 0) {
    return res.status(400).json({ error: 'Tidak ada session NEW.' });
  }

  // Create pending join records for all combinations
  const allJoinRecords: Array<{ id: string; groupId: string; groupName: string; inviteCode: string; sessionName: string }> = [];

  for (const group of groups) {
    for (const session of allNewSessions) {
      // Check if already joined
      if (db.hasSessionJoinedGroup(group.id, session.sessionName)) {
        continue;
      }

      const joinId = randomUUID();
      db.upsertGroupJoin({
        id: joinId,
        groupId: group.id,
        sessionName: session.sessionName,
        chatId: session.chatId,
        status: 'pending',
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      allJoinRecords.push({
        id: joinId,
        groupId: group.id,
        groupName: group.name,
        inviteCode: group.inviteCode,
        sessionName: session.sessionName,
      });
    }
  }

  if (allJoinRecords.length === 0) {
    return res.json({ ok: true, message: 'Semua session sudah join ke semua group', queued: 0 });
  }

  // Process all joins in background
  (async () => {
    console.log(`🔗 Starting JOIN ALL: ${allJoinRecords.length} joins (${allNewSessions.length} sessions × ${groups.length} groups)`);

    for (let i = 0; i < allJoinRecords.length; i++) {
      const record = allJoinRecords[i];
      const join = db.getGroupJoinById(record.id);
      if (!join) continue;

      db.upsertGroupJoin({ ...join, status: 'joining' });
      console.log(`  [${i + 1}/${allJoinRecords.length}] ${record.sessionName} → ${record.groupName}`);

      let success = false;
      let lastError = '';
      let retryCount = 0;

      while (!success && retryCount < 3) {
        const result = await wahaJoinGroup(record.sessionName, record.inviteCode);

        if (result.ok) {
          success = true;
          db.upsertGroupJoin({
            ...join,
            status: 'joined',
            retryCount,
            joinedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          console.log(`    ✅ Joined`);
        } else {
          retryCount++;
          lastError = result.error || 'Unknown error';
          console.log(`    ❌ Attempt ${retryCount}/3: ${lastError}`);

          if (retryCount < 3) {
            const retryDelay = 10000 + Math.random() * 5000;
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!success) {
        db.upsertGroupJoin({
          ...join,
          status: 'failed',
          retryCount,
          errorMessage: lastError,
          updatedAt: new Date().toISOString(),
        });
      }

      // Delay 10-15s before next
      if (i < allJoinRecords.length - 1) {
        const delay = 10000 + Math.random() * 5000;
        console.log(`    ⏳ Wait ${Math.round(delay / 1000)}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    console.log(`🔗 JOIN ALL completed`);
  })();

  return res.json({
    ok: true,
    message: `Join All dimulai: ${allJoinRecords.length} joins (${allNewSessions.length} sessions × ${groups.length} groups)`,
    queued: allJoinRecords.length,
    totalSessions: allNewSessions.length,
    totalGroups: groups.length,
  });
});

// Webhook endpoint for WAHA.
// Configure WAHA to call: http://<api-host>:4000/waha/webhook
// The payload shape depends on WAHA version; we handle a few common fields.
app.post('/waha/webhook', async (req, res) => {
  try {
    const body = req.body as any;
    console.log(`📡 [Webhook] Hit! Body keys: ${Object.keys(body || {}).join(',')}`);
    if (body.session) console.log(`   Session: ${body.session}`);

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
      (body.fromMe ??
        body?.payload?.fromMe ??
        body?.payload?.key?.fromMe ??
        key?.fromMe ??
        msg?.fromMe) ||
      false;

    const chatId =
      body.chatId ||
      body?.payload?.chatId ||
      body?.payload?.from ||
      body?.payload?.key?.remoteJid ||
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

    // Ignore Group Messages (User Request)
    // Legacy groups often use '-' in ID, new groups use '@g.us'
    // Relaxed: Removing '-' check to avoid false positives on new numbers
    if (String(chatId).endsWith('@g.us')) {
      return res.status(200).json({ ok: true, ignored: true, reason: 'group' });
    }

    // Explicitly check for ack events or status updates which are usually 'from me' or system
    if (body.event === 'message.ack' || body.event === 'message.revoked') {
      return res.status(200).json({ ok: true, ignored: true, reason: body.event });
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

      console.log(`📥 [Webhook] ${session} received message from ${chatId} (Cluster: ${config.cluster})`);

      const map = await getSessionToChatIdMapCached();
      const chatIdToSession: Record<string, string> = {};
      for (const [name, cid] of Object.entries(map)) {
        if (cid) chatIdToSession[String(cid)] = String(name);
      }

      const inboundSessionName = chatIdToSession[String(chatId)] || '';
      // Accept old-1, old1, old_1, OLD-2, etc. (jangan hanya old-\d+ supaya pairing "new2 → old-1" tetap jalan)
      const inboundIsOld = !!(inboundSessionName && /^old[-_]?\d+$/i.test(inboundSessionName));

      console.log('MAP:', chatIdToSession);
      console.log('INBOUND:', inboundSessionName);
      console.log(`   🔍 Sender: ${chatId} -> Session: "${inboundSessionName}" (IsOld: ${inboundIsOld})`);

      // NEW sessions should only participate in conversations with OLD sessions.
      // Block only if: no mapping for this chatId, or mapped session is not an OLD-style name.
      // DISABLED VALIDATION:
      // We want NEW sessions to reply to ANYONE for now, to ensure auto-replies are working.
      // The strict "must be OLD session" check was causing issues when mapping was incomplete.
      /*
      if (!inboundSessionName || !/^old[-_]?\d+$/i.test(inboundSessionName)) {
        console.log(`   ⛔ Ignored: Sender is not a known OLD session (map empty or name not old-style).`);
        debug('ignored:new_inbound_not_old', { session, chatId, inboundSessionName });
        return res.status(200).json({ ok: true, ignored: true });
      }
      */

      // Only enforce pairing for NEW sessions when talking to known OLD sessions.
      if ((config.cluster || 'old') === 'new') {
        const existingPair = db.getNewPairedOldChatId(config.wahaSession);
        if (!existingPair) {
          db.setNewPairedOldChatId(config.wahaSession, String(chatId));
          debug('paired:new_first_contact', { session, chatId, inboundSessionName });
          console.log(`   🤝 Paired ${config.wahaSession} with ${inboundSessionName} (${chatId})`);
        } else if (String(chatId) !== String(existingPair)) {
          console.log(`   ⛔ Ignored: Paired with different OLD session (${existingPair}).`);
          debug('ignored:new_not_paired_old', { session, chatId, inboundSessionName, pairedOldChatId: existingPair });
          return res.status(200).json({ ok: true, ignored: true });
        }
      }
    }

    // Check if message content exists (decryption check)
    if (!config.autoReplyScriptText) {
      // This is just a check, logic continues below
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

      // Throttle: jika tidak ada message id (WAHA kadang kirim 2 event untuk 1 pesan), hindari double reply.
      const lastMsgAt = progress.lastMessageAt ? new Date(progress.lastMessageAt).getTime() : 0;
      if (!inboundMessageId && lastMsgAt && Date.now() - lastMsgAt < 30_000) {
        debug('ignored:throttle_no_message_id', { session, chatId, lastMessageAt: progress.lastMessageAt });
        return res.status(200).json({ ok: true, ignored: true });
      }

      const parity = config.scriptLineParity || 'odd';

      // Dynamic Script Logic for NEW sessions:
      // If this is a NEW session, it should reply using the script of the OLD session it's talking to.
      let scriptContent = config.autoReplyScriptText || '';

      if ((config.cluster || 'old') === 'new') {
        // NEW membalas pakai script OLD yang mengirim (topik per-OLD dari preset).
        const map = await getSessionToChatIdMapCached();
        const chatIdToSession: Record<string, string> = {};
        for (const [name, cid] of Object.entries(map)) {
          if (cid) chatIdToSession[String(cid)] = String(name);
        }

        const inboundSessionName = chatIdToSession[String(chatId)];
        const lookupName = inboundSessionName ? normalizePresetSessionName(inboundSessionName) : '';
        const senderSession =
          (inboundSessionName ? db.getSessionByName(inboundSessionName) : undefined) ||
          (lookupName ? db.getSessionByName(lookupName) : undefined);

        if (senderSession?.autoReplyScriptText) {
          scriptContent = senderSession.autoReplyScriptText;
          console.log(`   📜 [Script] NEW pakai script OLD: "${lookupName || inboundSessionName}" (topik beda per OLD)`);
          debug('using_sender_script', { session, chatId, sender: lookupName || inboundSessionName });
        } else {
          console.log(`   ⚠️ [Script] Fallback ke script NEW (sender tidak ditemukan atau tanpa script: "${inboundSessionName || '?'}")`);
        }
      }

      const picked = pickReplyFromScript(
        scriptContent,
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

      if ((config.cluster || 'old') === 'new') {
        // Prevent concurrent replies to same chat (Imbalance Fix)
        const replyKey = `${config.wahaSession}:${chatId}`;
        // Simple in-memory lock map (defined at module level or attached to config, but module level is easier here)
        // We use a global map for this:
        if (global.pendingReplies?.has(replyKey)) {
          console.log(`   ⏳ [Reactive] Reply already pending for ${replyKey}, skipping concurrent message.`);
          return res.status(200).json({ ok: true, ignored: true, reason: 'pending_reply' });
        }

        if (!global.pendingReplies) global.pendingReplies = new Set();
        global.pendingReplies.add(replyKey);

        // Claim pesan ini dulu agar webhook duplikat (message + message.any) tidak kirim balas kedua.
        if (inboundMessageId) {
          db.setChatProgress(config.wahaSession, String(chatId), {
            ...progress,
            lastInboundMessageId: String(inboundMessageId),
            updatedAt: new Date().toISOString(),
          });
        }

        // Run in background (Fire-and-forget) to avoid blocking Webhook response
        (async () => {
          const delayMs = 15000 + Math.floor(Math.random() * 20000); // 15-35s
          console.log(`⏳ [Reactive] ${config.wahaSession} waiting ${Math.round(delayMs / 1000)}s before replying to ${chatId}...`);

          // Wait non-blocking
          await new Promise(resolve => setTimeout(resolve, delayMs));

          // Remove lock just before sending
          global.pendingReplies?.delete(replyKey);

          try {
            // Direct send, bypassing shared worker queue
            await wahaSendText({
              session: config.wahaSession,
              chatId: String(chatId),
              text: picked.text,
            });
            console.log(`🚀 [Reactive] ${config.wahaSession} sent reply to ${chatId}`);

            // Update progress AFTER send to ensure accurate accounting
            const newMessageCount = (progress.messageCount || 0) + 2;
            db.setChatProgress(config.wahaSession, String(chatId), {
              seasonIndex: picked.nextSeasonIndex,
              lineIndex: picked.nextLineIndex,
              messageCount: newMessageCount,
              lastInboundMessageId: inboundMessageId ? String(inboundMessageId) : progress.lastInboundMessageId,
              lastMessageAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

            debug('sent:script', { session, chatId, preview: String(picked.text || '').slice(0, 40), messageCount: newMessageCount });

          } catch (err: any) {
            console.error(`❌ [Reactive] Failed to send reply from ${config.wahaSession}:`, err.message);
            global.pendingReplies?.delete(replyKey); // Ensure lock is released even on error
          }
        })();

        return res.status(200).json({ ok: true, status: 'queued_reactive' });
      } else {
        await sendTextQueued({ session: config.wahaSession, chatId: String(chatId), text: picked.text });
      }

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
    // Dedup static reply: hindari double kirim saat WAHA kirim 2 event untuk 1 pesan.
    const staticProgress = db.getChatProgress(config.wahaSession, String(chatId)) ?? {
      seasonIndex: 0,
      lineIndex: 0,
      updatedAt: new Date().toISOString(),
    };
    if (inboundMessageId && staticProgress.lastInboundMessageId === String(inboundMessageId)) {
      debug('ignored:duplicate_inbound_static', { session, chatId, inboundMessageId });
      return res.status(200).json({ ok: true, ignored: true });
    }
    const staticLastAt = staticProgress.lastMessageAt ? new Date(staticProgress.lastMessageAt).getTime() : 0;
    if (!inboundMessageId && staticLastAt && Date.now() - staticLastAt < 30_000) {
      debug('ignored:throttle_static', { session, chatId });
      return res.status(200).json({ ok: true, ignored: true });
    }
    if (inboundMessageId) {
      db.setChatProgress(config.wahaSession, String(chatId), {
        seasonIndex: staticProgress.seasonIndex,
        lineIndex: staticProgress.lineIndex,
        lastInboundMessageId: String(inboundMessageId),
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
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
