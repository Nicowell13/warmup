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

// Multiple worker chains for parallel processing
const MAX_CONCURRENT_WORKERS = Number(process.env.SEND_MAX_CONCURRENT_WORKERS || 2);
const workerChains: Promise<void>[] = Array(MAX_CONCURRENT_WORKERS).fill(Promise.resolve());
const workerMetrics: Array<{ lastSentAt: number; sentCount: number }> = Array(MAX_CONCURRENT_WORKERS)
  .fill(null)
  .map(() => ({ lastSentAt: 0, sentCount: 0 }));

let nextWorkerIndex = 0;

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
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Serialize outgoing WAHA sends across multiple worker chains.
 * Round-robin distribution for parallel processing while maintaining per-worker rate limits.
 */
export function sendTextQueued(params: SendTextParams) {
  // Round-robin worker selection
  const workerIdx = nextWorkerIndex;
  nextWorkerIndex = (nextWorkerIndex + 1) % MAX_CONCURRENT_WORKERS;

  const operation = workerChains[workerIdx].then(async () => {
    const metrics = workerMetrics[workerIdx];
    
    const baseDelay = randomBetweenMs(SEND_DELAY_MIN_MS, SEND_DELAY_MAX_MS);
    const every = clampNonNegative(SEND_COOLDOWN_EVERY);
    const needCooldown = every > 0 && metrics.sentCount > 0 && metrics.sentCount % every === 0;
    const cooldownDelay = needCooldown ? randomBetweenMs(SEND_COOLDOWN_MIN_MS, SEND_COOLDOWN_MAX_MS) : 0;

    const plannedDelay = baseDelay + cooldownDelay;
    if (plannedDelay > 0) {
      const now = Date.now();
      const waitFor = Math.max(0, metrics.lastSentAt + plannedDelay - now);
      if (waitFor > 0) await sleep(waitFor);
    }
    
    try {
      await wahaSendText(params);
      metrics.sentCount += 1;
      console.log(`📤 Worker ${workerIdx + 1}/${MAX_CONCURRENT_WORKERS}: ${params.session} → ${params.chatId.substring(0, 12)}...`);
    } finally {
      metrics.lastSentAt = Date.now();
    }
  });

  // Keep the global chain alive even if this operation fails
  workerChains[workerIdx] = operation.catch(() => undefined);
  return operation;
}
