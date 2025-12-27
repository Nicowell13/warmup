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
  kind: 'script-next';
  status: 'pending' | 'sent' | 'error';
  lastError?: string;
  updatedAt: string;
  createdAt: string;
};

type DbShape = {
  sessions: SessionRecord[];
  chatProgress?: Record<string, Record<string, ChatProgress>>;
  automations?: AutomationRecord[];
  scheduledTasks?: ScheduledTask[];
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
    return { sessions: [], chatProgress: {}, automations: [], scheduledTasks: [] };
  }
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const parsed = JSON.parse(raw) as DbShape;
  return {
    sessions: parsed.sessions || [],
    chatProgress: parsed.chatProgress || {},
    automations: parsed.automations || [],
    scheduledTasks: parsed.scheduledTasks || [],
  };
}

function writeDb(db: DbShape) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

export const db = {
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
    dbState.scheduledTasks![idx] = {
      ...dbState.scheduledTasks![idx],
      status,
      lastError,
      updatedAt: new Date().toISOString(),
    };
    writeDb(dbState);
  },
};
