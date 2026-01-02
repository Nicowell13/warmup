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

const SEND_MAX_CONCURRENT_WORKERS = (() => {
  const raw = Number(process.env.SEND_MAX_CONCURRENT_WORKERS ?? 2);
  if (!Number.isFinite(raw)) return 2;
  return Math.max(1, Math.floor(raw));
})();

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

// Global concurrency limiter: cap active sends across all workers.
let activeSends = 0;
const sendWaiters: Array<() => void> = [];

async function acquireSendPermit(): Promise<void> {
  if (activeSends < SEND_MAX_CONCURRENT_WORKERS) {
    activeSends += 1;
    return;
  }
  await new Promise<void>((resolve) => sendWaiters.push(resolve));
  activeSends += 1;
}

function releaseSendPermit(): void {
  activeSends = Math.max(0, activeSends - 1);
  const next = sendWaiters.shift();
  if (next) next();
}

/**
 * Serialize all outgoing WAHA sends in this API process.
 * This prevents parallel sends across webhook, campaign, and scheduler.
 */
export function sendTextQueued(params: SendTextParams) {
  const worker = getWorker(params.session);

  const operation = worker.chain.then(async () => {
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

    await acquireSendPermit();
    try {
      await wahaSendText(params);
      worker.sentCount += 1;
    } finally {
      releaseSendPermit();
      // Keep pacing even if WAHA send fails (e.g. session logout),
      // so we don't hammer WAHA and we don't get stuck on a rejected chain.
      worker.lastSentAt = Date.now();
    }
  });

  // Keep the worker chain alive even if this operation fails,
  // while still returning a rejected promise to the caller.
  worker.chain = operation.catch(() => undefined);
  return operation;
}
