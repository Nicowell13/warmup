import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SessionRecord = {
  id: string;
  wahaSession: string;
  cluster?: 'old' | 'new';
  autoReplyEnabled: boolean;
  autoReplyMode?: 'static' | 'script';
  scriptLineParity?: 'odd' | 'even' | 'all';
  autoReplyText: string;
  autoReplyScriptText?: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatProgress = {
  seasonIndex: number;
  lineIndex: number;
  lastInboundMessageId?: string;
  messageCount?: number; // Total pesan keluar+masuk untuk NEW
  lastOldIndex?: number; // Index OLD session terakhir yang digunakan (0-4)
  lastMessageAt?: string; // Timestamp pesan terakhir
  updatedAt: string;
};

export type AutomationRecord = {
  id: string;
  name: string;
  active: boolean;
  timezone: string;
  windowStart: string; // HH:mm
  windowEnd: string; // HH:mm
  day1MessagesPerNew: number;
  day2MessagesPerNew: number;
  day3MessagesPerNew: number;
  newChatIds: string[];
  oldSessionNames?: string[];
  startDate: string; // YYYY-MM-DD in timezone
  createdAt: string;
  updatedAt: string;
};

export type ScheduledTask = {
  id: string;
  automationId: string;
  dueAt: string; // ISO (UTC)
  chatId: string;
  kind: 'script-next' | 'wa12-wave-reset';
  status: 'pending' | 'sent' | 'error';
  lastError?: string;
  updatedAt: string;
  createdAt: string;
  senderSession?: string; // which session sends (if specified, overrides automation oldSessionNames pick)
  targetNewChatId?: string; // untuk tracking target NEW (jika OLD yang kirim)
  oldRotationIndex?: number; // index OLD session dalam rotation (0-4)
  waveIndex?: number;
  payload?: any;
  retryCount?: number; // Issue #4: Track retry attempts
};

export type AutomationProgressSummary = {
  automationId: string;
  total: number;
  pending: number;
  sent: number;
  error: number;
  nextDueAt: string | null;
  recentErrors: Array<{
    dueAt: string;
    senderSession?: string;
    chatId: string;
    lastError?: string;
  }>;
};

type DbShape = {
  sessions: SessionRecord[];
  chatProgress?: Record<string, Record<string, ChatProgress>>;
  automations?: AutomationRecord[];
  scheduledTasks?: ScheduledTask[];
  newPairings?: Record<string, { oldChatId: string; updatedAt: string }>;
  dailyStats?: Record<string, DailySessionStats>; // key: "sessionName:YYYY-MM-DD"
  flags?: {
    suppressNewAutoReplyUntil?: string | null;
  };
  // Group feature
  groups?: GroupRecord[];
  groupJoins?: GroupJoinRecord[];
};

export type DailySessionStats = {
  sessionName: string;
  date: string; // YYYY-MM-DD
  messagesSent: number;
  lastMessageAt: string;
};

// ===== Group Feature Types =====
export type GroupRecord = {
  id: string;
  name: string;                    // Display name untuk group
  inviteLink: string;              // https://chat.whatsapp.com/xxx
  inviteCode: string;              // xxx (extracted dari link)
  createdAt: string;
  updatedAt: string;
};

export type GroupJoinRecord = {
  id: string;
  groupId: string;                 // Reference ke GroupRecord
  sessionName: string;             // e.g. "new-1"
  chatId: string;                  // e.g. "628xxx@c.us"
  status: 'pending' | 'joining' | 'joined' | 'failed';
  retryCount: number;              // Track retry attempts (max 3)
  errorMessage?: string;
  joinedAt?: string;
  createdAt: string;
  updatedAt: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDbFilePath(): string {
  // Simple JSON persistence to avoid adding native deps on Windows.
  // If you want SQLite later, we can swap this implementation.
  const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'db.json');
}

const DB_FILE = getDbFilePath();

function readDb(): DbShape {
  if (!fs.existsSync(DB_FILE)) {
    return { sessions: [], chatProgress: {}, automations: [], scheduledTasks: [], newPairings: {}, dailyStats: {}, flags: {}, groups: [], groupJoins: [] };
  }
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const parsed = JSON.parse(raw) as DbShape;
  return {
    sessions: parsed.sessions || [],
    chatProgress: parsed.chatProgress || {},
    automations: parsed.automations || [],
    scheduledTasks: parsed.scheduledTasks || [],
    newPairings: parsed.newPairings || {},
    dailyStats: parsed.dailyStats || {},
    flags: parsed.flags || {},
    groups: parsed.groups || [],
    groupJoins: parsed.groupJoins || [],
  };
}

function writeDb(db: DbShape) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

export const db = {
  getSuppressNewAutoReplyUntil(): string | null {
    const dbState = readDb();
    const v = dbState.flags?.suppressNewAutoReplyUntil;
    return v ? String(v) : null;
  },

  setSuppressNewAutoReplyUntil(valueIsoOrNull: string | null): void {
    const dbState = readDb();
    if (!dbState.flags) dbState.flags = {};
    dbState.flags.suppressNewAutoReplyUntil = valueIsoOrNull ? String(valueIsoOrNull) : null;
    writeDb(dbState);
  },
  listSessions(): SessionRecord[] {
    return readDb().sessions;
  },

  getSessionById(id: string): SessionRecord | undefined {
    return readDb().sessions.find((s) => s.id === id);
  },

  getSessionByName(wahaSession: string): SessionRecord | undefined {
    return readDb().sessions.find((s) => s.wahaSession === wahaSession);
  },

  upsertSession(session: SessionRecord): SessionRecord {
    const now = new Date().toISOString();
    const dbState = readDb();
    const existingIndex = dbState.sessions.findIndex((s) => s.id === session.id);

    if (existingIndex >= 0) {
      const updated: SessionRecord = {
        ...dbState.sessions[existingIndex],
        ...session,
        updatedAt: now,
      };
      dbState.sessions[existingIndex] = updated;
      writeDb(dbState);
      return updated;
    }

    const created: SessionRecord = {
      ...session,
      createdAt: now,
      updatedAt: now,
    };
    dbState.sessions.push(created);
    writeDb(dbState);
    return created;
  },

  deleteSession(id: string): boolean {
    const dbState = readDb();
    const deleted = dbState.sessions.find((s) => s.id === id);
    const before = dbState.sessions.length;
    dbState.sessions = dbState.sessions.filter((s) => s.id !== id);
    const after = dbState.sessions.length;
    if (after !== before) {
      if (deleted?.wahaSession && dbState.chatProgress) {
        delete dbState.chatProgress[deleted.wahaSession];
      }
      writeDb(dbState);
      return true;
    }
    return false;
  },

  getChatProgress(wahaSession: string, chatId: string): ChatProgress | undefined {
    const dbState = readDb();
    return dbState.chatProgress?.[wahaSession]?.[chatId];
  },

  setChatProgress(wahaSession: string, chatId: string, progress: ChatProgress): ChatProgress {
    const dbState = readDb();
    if (!dbState.chatProgress) dbState.chatProgress = {};
    if (!dbState.chatProgress[wahaSession]) dbState.chatProgress[wahaSession] = {};
    dbState.chatProgress[wahaSession][chatId] = progress;
    writeDb(dbState);
    return progress;
  },

  getNewPairedOldChatId(newSession: string): string | null {
    const dbState = readDb();
    const v = dbState.newPairings?.[newSession];
    return v?.oldChatId ? String(v.oldChatId) : null;
  },

  setNewPairedOldChatId(newSession: string, oldChatId: string): void {
    const dbState = readDb();
    if (!dbState.newPairings) dbState.newPairings = {};
    dbState.newPairings[String(newSession)] = {
      oldChatId: String(oldChatId),
      updatedAt: new Date().toISOString(),
    };
    writeDb(dbState);
  },

  clearNewPairings(): void {
    const dbState = readDb();
    dbState.newPairings = {};
    writeDb(dbState);
  },

  replaceNewPairings(pairs: Record<string, string>): void {
    const dbState = readDb();
    const now = new Date().toISOString();
    dbState.newPairings = {};
    for (const [newSession, oldChatId] of Object.entries(pairs || {})) {
      dbState.newPairings[String(newSession)] = { oldChatId: String(oldChatId), updatedAt: now };
    }
    writeDb(dbState);
  },

  hasPendingScheduledTaskForSenderChat(senderSession: string, chatId: string, withinMs = 15 * 60 * 1000): boolean {
    const dbState = readDb();
    const now = Date.now();
    const latest = new Date(now + Math.max(0, withinMs)).toISOString();
    return (dbState.scheduledTasks || []).some(
      (t) =>
        t.status === 'pending' &&
        String(t.senderSession || '') === String(senderSession) &&
        String(t.chatId) === String(chatId) &&
        t.dueAt <= latest
    );
  },

  listAutomations(): AutomationRecord[] {
    return readDb().automations || [];
  },

  getAutomationById(id: string): AutomationRecord | undefined {
    return (readDb().automations || []).find((a) => a.id === id);
  },

  upsertAutomation(automation: AutomationRecord): AutomationRecord {
    const now = new Date().toISOString();
    const dbState = readDb();
    if (!dbState.automations) dbState.automations = [];

    const idx = dbState.automations.findIndex((a) => a.id === automation.id);
    if (idx >= 0) {
      const updated = { ...dbState.automations[idx], ...automation, updatedAt: now };
      dbState.automations[idx] = updated;
      writeDb(dbState);
      return updated;
    }

    const created = { ...automation, createdAt: now, updatedAt: now };
    dbState.automations.push(created);
    writeDb(dbState);
    return created;
  },

  deleteAutomation(id: string): boolean {
    const dbState = readDb();
    const before = (dbState.automations || []).length;
    dbState.automations = (dbState.automations || []).filter((a) => a.id !== id);
    dbState.scheduledTasks = (dbState.scheduledTasks || []).filter((t) => t.automationId !== id);
    const after = (dbState.automations || []).length;
    if (after !== before) {
      writeDb(dbState);
      return true;
    }
    return false;
  },

  cancelPendingScheduledTasksForAutomation(automationId: string, reason = 'stopped'): number {
    const dbState = readDb();
    const now = new Date().toISOString();
    let changed = 0;
    dbState.scheduledTasks = (dbState.scheduledTasks || []).map((t) => {
      if (t.automationId !== automationId) return t;
      if (t.status !== 'pending') return t;
      changed += 1;
      return {
        ...t,
        status: 'error',
        lastError: reason,
        updatedAt: now,
      };
    });
    writeDb(dbState);
    return changed;
  },

  replaceScheduledTasksForAutomation(automationId: string, tasks: ScheduledTask[]) {
    const dbState = readDb();
    const now = new Date().toISOString();
    const existing = (dbState.scheduledTasks || []).filter((t) => t.automationId !== automationId);
    const withMeta = tasks.map((t) => ({
      ...t,
      createdAt: t.createdAt || now,
      updatedAt: now,
    }));
    dbState.scheduledTasks = [...existing, ...withMeta];
    writeDb(dbState);
  },

  listScheduledTasksForAutomation(automationId: string): ScheduledTask[] {
    const dbState = readDb();
    return (dbState.scheduledTasks || []).filter((t) => t.automationId === automationId);
  },

  getAutomationProgressSummary(automationId: string): AutomationProgressSummary {
    const tasks = db.listScheduledTasksForAutomation(automationId);
    let pending = 0;
    let sent = 0;
    let error = 0;
    let nextDueAt: string | null = null;

    for (const t of tasks) {
      if (t.status === 'pending') {
        pending += 1;
        if (!nextDueAt || t.dueAt < nextDueAt) nextDueAt = t.dueAt;
      } else if (t.status === 'sent') {
        sent += 1;
      } else if (t.status === 'error') {
        error += 1;
      }
    }

    const recentErrors = tasks
      .filter((t) => t.status === 'error')
      .slice()
      .sort((a, b) => b.dueAt.localeCompare(a.dueAt))
      .slice(0, 8)
      .map((t) => ({
        dueAt: t.dueAt,
        senderSession: t.senderSession,
        chatId: t.chatId,
        lastError: t.lastError,
      }));

    return {
      automationId,
      total: tasks.length,
      pending,
      sent,
      error,
      nextDueAt,
      recentErrors,
    };
  },

  listDueScheduledTasks(nowIso: string, limit: number): ScheduledTask[] {
    const dbState = readDb();
    const tasks = (dbState.scheduledTasks || [])
      .filter((t) => t.status === 'pending')
      .filter((t) => t.dueAt <= nowIso)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return tasks.slice(0, limit);
  },

  markScheduledTask(id: string, status: 'sent' | 'error', lastError?: string) {
    const dbState = readDb();
    const idx = (dbState.scheduledTasks || []).findIndex((t) => t.id === id);
    if (idx < 0) return;
    const task = dbState.scheduledTasks![idx];
    const retryCount = (task.retryCount || 0) + (status === 'error' ? 1 : 0);

    // Issue #4 fix: Retry once if first attempt failed (max retryCount = 1)
    if (status === 'error' && retryCount === 1) {
      dbState.scheduledTasks![idx] = {
        ...task,
        status: 'pending', // Reset to pending for retry
        dueAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // Retry dalam 5 menit
        lastError,
        retryCount,
        updatedAt: new Date().toISOString(),
      };
    } else {
      dbState.scheduledTasks![idx] = {
        ...task,
        status,
        lastError,
        retryCount,
        updatedAt: new Date().toISOString(),
      };
    }
    writeDb(dbState);
  },

  // ===== Daily Session Stats (for limiting messages per day) =====

  getSessionDailyStats(sessionName: string, date?: string): DailySessionStats | null {
    const dbState = readDb();
    const targetDate = date || new Date().toISOString().split('T')[0];
    const key = `${sessionName}:${targetDate}`;
    return dbState.dailyStats?.[key] || null;
  },

  incrementSessionDailyCount(sessionName: string): number {
    const dbState = readDb();
    const now = new Date();
    const targetDate = now.toISOString().split('T')[0];
    const key = `${sessionName}:${targetDate}`;

    if (!dbState.dailyStats) dbState.dailyStats = {};

    const existing = dbState.dailyStats[key];
    if (existing) {
      existing.messagesSent += 1;
      existing.lastMessageAt = now.toISOString();
    } else {
      dbState.dailyStats[key] = {
        sessionName,
        date: targetDate,
        messagesSent: 1,
        lastMessageAt: now.toISOString(),
      };
    }

    writeDb(dbState);
    return dbState.dailyStats[key].messagesSent;
  },

  isSessionDailyLimitReached(sessionName: string, limit = 30): boolean {
    const stats = db.getSessionDailyStats(sessionName);
    return stats ? stats.messagesSent >= limit : false;
  },

  getSessionTodayMessageCount(sessionName: string): number {
    const stats = db.getSessionDailyStats(sessionName);
    return stats?.messagesSent || 0;
  },

  // Clean up old stats (keep only last 7 days)
  cleanupOldDailyStats(): number {
    const dbState = readDb();
    if (!dbState.dailyStats) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    let cleaned = 0;
    for (const key of Object.keys(dbState.dailyStats)) {
      const dateStr = key.split(':')[1];
      if (dateStr && dateStr < cutoffDateStr) {
        delete dbState.dailyStats[key];
        cleaned += 1;
      }
    }

    if (cleaned > 0) writeDb(dbState);
    return cleaned;
  },

  // ===== Group Feature Functions =====

  listGroups(): GroupRecord[] {
    return readDb().groups || [];
  },

  getGroupById(id: string): GroupRecord | undefined {
    return (readDb().groups || []).find((g) => g.id === id);
  },

  createGroup(group: Omit<GroupRecord, 'createdAt' | 'updatedAt'>): GroupRecord {
    const now = new Date().toISOString();
    const dbState = readDb();
    if (!dbState.groups) dbState.groups = [];

    const created: GroupRecord = {
      ...group,
      createdAt: now,
      updatedAt: now,
    };
    dbState.groups.push(created);
    writeDb(dbState);
    return created;
  },

  deleteGroup(id: string): boolean {
    const dbState = readDb();
    const before = (dbState.groups || []).length;
    dbState.groups = (dbState.groups || []).filter((g) => g.id !== id);
    // Also delete related joins
    dbState.groupJoins = (dbState.groupJoins || []).filter((j) => j.groupId !== id);
    const after = (dbState.groups || []).length;
    if (after !== before) {
      writeDb(dbState);
      return true;
    }
    return false;
  },

  listGroupJoins(groupId?: string): GroupJoinRecord[] {
    const dbState = readDb();
    const joins = dbState.groupJoins || [];
    if (groupId) {
      return joins.filter((j) => j.groupId === groupId);
    }
    return joins;
  },

  getGroupJoinById(id: string): GroupJoinRecord | undefined {
    return (readDb().groupJoins || []).find((j) => j.id === id);
  },

  upsertGroupJoin(record: GroupJoinRecord): GroupJoinRecord {
    const now = new Date().toISOString();
    const dbState = readDb();
    if (!dbState.groupJoins) dbState.groupJoins = [];

    const idx = dbState.groupJoins.findIndex((j) => j.id === record.id);
    if (idx >= 0) {
      const updated = { ...dbState.groupJoins[idx], ...record, updatedAt: now };
      dbState.groupJoins[idx] = updated;
      writeDb(dbState);
      return updated;
    }

    const created: GroupJoinRecord = {
      ...record,
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
    dbState.groupJoins.push(created);
    writeDb(dbState);
    return created;
  },

  // Get all NEW sessions for group join (no eligibility check)
  getEligibleNewSessions(): Array<{ sessionName: string; chatId: string }> {
    const dbState = readDb();
    const newSessions = (dbState.sessions || []).filter((s) => s.cluster === 'new');

    return newSessions.map((s) => ({
      sessionName: s.wahaSession,
      chatId: s.wahaSession, // Use session name as placeholder, real chatId comes from WAHA
    }));
  },

  // Check if session already joined a specific group
  hasSessionJoinedGroup(groupId: string, sessionName: string): boolean {
    const dbState = readDb();
    return (dbState.groupJoins || []).some(
      (j) => j.groupId === groupId && j.sessionName === sessionName && j.status === 'joined'
    );
  },

  // Get pending joins that need retry
  getPendingGroupJoins(): GroupJoinRecord[] {
    const dbState = readDb();
    return (dbState.groupJoins || []).filter(
      (j) => j.status === 'pending' || (j.status === 'failed' && j.retryCount < 3)
    );
  },
};
