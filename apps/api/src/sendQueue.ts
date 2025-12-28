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

let chain: Promise<void> = Promise.resolve();
let lastSentAt = 0;
let sentCount = 0;

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
  chain = chain.then(async () => {
    const baseDelay = randomBetweenMs(SEND_DELAY_MIN_MS, SEND_DELAY_MAX_MS);
    const every = clampNonNegative(SEND_COOLDOWN_EVERY);
    const needCooldown = every > 0 && sentCount > 0 && sentCount % every === 0;
    const cooldownDelay = needCooldown ? randomBetweenMs(SEND_COOLDOWN_MIN_MS, SEND_COOLDOWN_MAX_MS) : 0;

    const plannedDelay = baseDelay + cooldownDelay;
    if (plannedDelay > 0) {
      const now = Date.now();
      const waitFor = Math.max(0, lastSentAt + plannedDelay - now);
      if (waitFor > 0) await sleep(waitFor);
    }

    await wahaSendText(params);
    lastSentAt = Date.now();
    sentCount += 1;
  });

  return chain;
}
