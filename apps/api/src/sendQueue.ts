import { wahaSendText } from './waha.js';

type SendTextParams = {
  session: string;
  chatId: string;
  text: string;
};

const SEND_DELAY_MIN_MS = Number(process.env.SEND_DELAY_MIN_MS || 12_000);
const SEND_DELAY_MAX_MS = Number(process.env.SEND_DELAY_MAX_MS || 20_000);

const SEND_COOLDOWN_EVERY = Number(process.env.SEND_COOLDOWN_EVERY || 5);
const SEND_COOLDOWN_MIN_MS = Number(process.env.SEND_COOLDOWN_MIN_MS || 15_000);
const SEND_COOLDOWN_MAX_MS = Number(process.env.SEND_COOLDOWN_MAX_MS || 30_000);

type WorkerState = {
  chain: Promise<void>;
  lastSentAt: number;
  sentCount: number;
};

const workers = new Map<string, WorkerState>();

function getWorkerKey(session: string): string {
  const s = String(session || '').trim();
  const oldMatch = /^old-(\d+)$/i.exec(s);
  if (oldMatch) return `pair-${Number(oldMatch[1]) || 0}`;

  const newMatch = /^new-(\d+)$/i.exec(s);
  if (newMatch) {
    const n = Number(newMatch[1]) || 0;
    // new-1,new-2 -> pair-1; new-3,new-4 -> pair-2; ...
    return `pair-${Math.max(1, Math.ceil(n / 2))}`;
  }

  // Fallback: isolate unknown sessions into their own worker
  return `session-${s}`;
}

function getWorker(session: string): WorkerState {
  const key = getWorkerKey(session);
  const existing = workers.get(key);
  if (existing) return existing;
  const created: WorkerState = { chain: Promise.resolve(), lastSentAt: 0, sentCount: 0 };
  workers.set(key, created);
  return created;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampNonNegative(n: number) {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function randomBetweenMs(minMs: number, maxMs: number) {
  const min = clampNonNegative(minMs);
  const max = clampNonNegative(maxMs);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  // Inclusive range
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Serialize all outgoing WAHA sends in this API process.
 * This prevents parallel sends across webhook, campaign, and scheduler.
 */
export function sendTextQueued(params: SendTextParams) {
  const worker = getWorker(params.session);

  worker.chain = worker.chain.then(async () => {
    const baseDelay = randomBetweenMs(SEND_DELAY_MIN_MS, SEND_DELAY_MAX_MS);
    const every = clampNonNegative(SEND_COOLDOWN_EVERY);
    const needCooldown = every > 0 && worker.sentCount > 0 && worker.sentCount % every === 0;
    const cooldownDelay = needCooldown ? randomBetweenMs(SEND_COOLDOWN_MIN_MS, SEND_COOLDOWN_MAX_MS) : 0;

    const plannedDelay = baseDelay + cooldownDelay;
    if (plannedDelay > 0) {
      const now = Date.now();
      const waitFor = Math.max(0, worker.lastSentAt + plannedDelay - now);
      if (waitFor > 0) await sleep(waitFor);
    }

    await wahaSendText(params);
    worker.lastSentAt = Date.now();
    worker.sentCount += 1;
  });

  return worker.chain;
}
