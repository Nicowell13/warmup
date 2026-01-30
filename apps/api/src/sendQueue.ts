import { wahaSendText, wahaSendSeen, wahaStartTyping, wahaStopTyping } from './waha.js';
import { db } from './db.js';

type SendTextParams = {
  session: string;
  chatId: string;
  text: string;
  // Optional: skip human-like behavior for scheduled tasks
  skipHumanBehavior?: boolean;
};

// ===== Delay Configuration =====
// Increased delays for more natural warm-up behavior
const SEND_DELAY_MIN_MS = Number(process.env.SEND_DELAY_MIN_MS || 45_000);      // 45 seconds
const SEND_DELAY_MAX_MS = Number(process.env.SEND_DELAY_MAX_MS || 120_000);     // 2 minutes

// Cooldown: extra pause after every N messages
const SEND_COOLDOWN_EVERY = Number(process.env.SEND_COOLDOWN_EVERY || 3);
const SEND_COOLDOWN_MIN_MS = Number(process.env.SEND_COOLDOWN_MIN_MS || 60_000);   // 1 minute
const SEND_COOLDOWN_MAX_MS = Number(process.env.SEND_COOLDOWN_MAX_MS || 180_000);  // 3 minutes

// Progressive delay: delay increases as more messages are sent
const PROGRESSIVE_DELAY_MULTIPLIER = Number(process.env.PROGRESSIVE_DELAY_MULTIPLIER || 1.1);
const MAX_PROGRESSIVE_MULTIPLIER = Number(process.env.MAX_PROGRESSIVE_MULTIPLIER || 2.5);

// Daily limit per session
const DAILY_LIMIT_PER_SESSION = Number(process.env.DAILY_LIMIT_PER_SESSION || 30);

// Human-like behavior delays
const READ_DELAY_MIN_MS = Number(process.env.READ_DELAY_MIN_MS || 2_000);   // 2 seconds
const READ_DELAY_MAX_MS = Number(process.env.READ_DELAY_MAX_MS || 5_000);   // 5 seconds
const TYPING_DELAY_MIN_MS = Number(process.env.TYPING_DELAY_MIN_MS || 3_000);  // 3 seconds
const TYPING_DELAY_MAX_MS = Number(process.env.TYPING_DELAY_MAX_MS || 8_000);  // 8 seconds
const TYPING_MS_PER_CHAR = Number(process.env.TYPING_MS_PER_CHAR || 50);    // 50ms per character

// Enable/disable human-like behavior
const ENABLE_HUMAN_BEHAVIOR = process.env.ENABLE_HUMAN_BEHAVIOR !== 'false';

// Single worker for maximum safety
const MAX_CONCURRENT_WORKERS = Number(process.env.SEND_MAX_CONCURRENT_WORKERS || 1);
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
 * Apply jitter to avoid predictable patterns (±30%)
 */
function applyJitter(delayMs: number): number {
  const jitterPercent = 0.3;
  const jitter = delayMs * jitterPercent * (Math.random() * 2 - 1);
  return Math.max(1000, Math.round(delayMs + jitter));
}

/**
 * Get progressive multiplier based on session's daily message count
 * The more messages sent today, the longer the delays
 */
function getProgressiveMultiplier(messageCount: number): number {
  const multiplier = Math.pow(PROGRESSIVE_DELAY_MULTIPLIER, Math.floor(messageCount / 10));
  return Math.min(multiplier, MAX_PROGRESSIVE_MULTIPLIER);
}

/**
 * Calculate typing duration based on message length
 * Longer messages = longer "typing" time
 */
function calculateTypingDuration(text: string): number {
  const baseTypingTime = randomBetweenMs(TYPING_DELAY_MIN_MS, TYPING_DELAY_MAX_MS);
  const charBasedTime = (text?.length || 0) * TYPING_MS_PER_CHAR;
  // Cap at 15 seconds max typing time
  return Math.min(baseTypingTime + charBasedTime, 15000);
}

/**
 * Simulate human reading and typing behavior
 */
async function simulateHumanBehavior(session: string, chatId: string, text: string): Promise<void> {
  try {
    // 1. Wait a bit before "reading" the message
    const readDelay = randomBetweenMs(READ_DELAY_MIN_MS, READ_DELAY_MAX_MS);
    await sleep(readDelay);

    // 2. Mark message as read (blue ticks)
    await wahaSendSeen(session, chatId);
    console.log(`   👁️ Read receipt sent: ${session} → ${chatId.substring(0, 12)}...`);

    // 3. Wait before starting to type
    const thinkDelay = randomBetweenMs(TYPING_DELAY_MIN_MS, TYPING_DELAY_MAX_MS);
    await sleep(thinkDelay);

    // 4. Show typing indicator
    await wahaStartTyping(session, chatId);
    console.log(`   ⌨️ Typing started: ${session}`);

    // 5. Wait based on message length (simulating actual typing)
    const typingDuration = calculateTypingDuration(text);
    await sleep(typingDuration);

    // 6. Stop typing (optional - WAHA might auto-stop)
    await wahaStopTyping(session, chatId).catch(() => { });

  } catch (err) {
    // Don't fail the send if human behavior simulation fails
    console.warn(`⚠️ Human behavior simulation failed: ${(err as Error)?.message || 'unknown'}`);
  }
}

/**
 * Serialize outgoing WAHA sends with improved delays and human-like behavior.
 * Key improvements:
 * 1. Progressive delay based on message count
 * 2. Daily limit per session
 * 3. Read receipts and typing indicators
 * 4. Jitter to avoid predictable patterns
 */
export function sendTextQueued(params: SendTextParams) {
  // Check daily limit first
  if (db.isSessionDailyLimitReached(params.session, DAILY_LIMIT_PER_SESSION)) {
    console.log(`⚠️ Session ${params.session} reached daily limit (${DAILY_LIMIT_PER_SESSION}), skipping...`);
    return Promise.resolve();
  }

  // Round-robin worker selection
  const workerIdx = nextWorkerIndex;
  nextWorkerIndex = (nextWorkerIndex + 1) % MAX_CONCURRENT_WORKERS;

  const operation = workerChains[workerIdx].then(async () => {
    // Double-check daily limit (in case it changed while queued)
    if (db.isSessionDailyLimitReached(params.session, DAILY_LIMIT_PER_SESSION)) {
      console.log(`⚠️ Session ${params.session} reached daily limit while queued, skipping...`);
      return;
    }

    const metrics = workerMetrics[workerIdx];
    const dailyCount = db.getSessionTodayMessageCount(params.session);

    // Calculate progressive multiplier based on today's message count
    const progressiveMultiplier = getProgressiveMultiplier(dailyCount);

    // Base delay with progressive multiplier
    const baseDelay = randomBetweenMs(SEND_DELAY_MIN_MS, SEND_DELAY_MAX_MS);
    const progressiveDelay = Math.round(baseDelay * progressiveMultiplier);

    // Cooldown check
    const every = clampNonNegative(SEND_COOLDOWN_EVERY);
    const needCooldown = every > 0 && metrics.sentCount > 0 && metrics.sentCount % every === 0;
    const cooldownDelay = needCooldown ? randomBetweenMs(SEND_COOLDOWN_MIN_MS, SEND_COOLDOWN_MAX_MS) : 0;

    // Apply jitter to final delay
    const plannedDelay = applyJitter(progressiveDelay + cooldownDelay);

    if (plannedDelay > 0) {
      const now = Date.now();
      const waitFor = Math.max(0, metrics.lastSentAt + plannedDelay - now);
      if (waitFor > 0) {
        console.log(`   ⏳ Waiting ${Math.round(waitFor / 1000)}s before next message...`);
        await sleep(waitFor);
      }
    }

    try {
      // Simulate human behavior (read receipt + typing) before sending
      if (ENABLE_HUMAN_BEHAVIOR && !params.skipHumanBehavior) {
        await simulateHumanBehavior(params.session, params.chatId, params.text);
      }

      // Send the actual message
      await wahaSendText(params);

      // Increment daily counter
      const newCount = db.incrementSessionDailyCount(params.session);

      metrics.sentCount += 1;
      console.log(`📤 Worker ${workerIdx + 1}/${MAX_CONCURRENT_WORKERS}: ${params.session} → ${params.chatId.substring(0, 12)}... (today: ${newCount}/${DAILY_LIMIT_PER_SESSION})`);

    } finally {
      metrics.lastSentAt = Date.now();
    }
  });

  // Keep the global chain alive even if this operation fails
  workerChains[workerIdx] = operation.catch((err) => {
    console.error(`❌ Send failed: ${(err as Error)?.message || 'unknown'}`);
  });

  return operation;
}

/**
 * Get current status of send queue
 */
export function getSendQueueStatus() {
  return {
    workers: MAX_CONCURRENT_WORKERS,
    dailyLimit: DAILY_LIMIT_PER_SESSION,
    delayRange: `${SEND_DELAY_MIN_MS / 1000}s - ${SEND_DELAY_MAX_MS / 1000}s`,
    cooldownEvery: SEND_COOLDOWN_EVERY,
    progressiveMultiplier: PROGRESSIVE_DELAY_MULTIPLIER,
    humanBehaviorEnabled: ENABLE_HUMAN_BEHAVIOR,
  };
}
