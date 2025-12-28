import { db } from './db.js';
import { pickRandom, pickReplyFromScript } from './script.js';
import { sendTextQueued } from './sendQueue.js';

let started = false;

type SchedulerOptions = {
  pollIntervalMs?: number;
  batchSize?: number;
};

export function startScheduler(options: SchedulerOptions = {}) {
  if (started) return;
  started = true;

  const pollIntervalMs = options.pollIntervalMs ?? 15_000;
  const batchSize = options.batchSize ?? 10;

  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    const nowIso = new Date().toISOString();
    const due = db.listDueScheduledTasks(nowIso, batchSize);
    if (due.length === 0) {
      running = false;
      return;
    }

    try {
      for (const task of due) {
        try {
          const automation = db.getAutomationById(task.automationId);
          if (!automation?.active) {
            db.markScheduledTask(task.id, 'sent');
            continue;
          }

        let chosen: any = null;
        if (task.senderSession) {
          // Orchestrated mode: task specifies exact sender
          chosen = db.getSessionByName(task.senderSession);
          if (!chosen || (chosen.autoReplyScriptText || '').trim().length === 0) {
            db.markScheduledTask(task.id, 'error', `Sender session not found or no script: ${task.senderSession}`);
            continue;
          }
        } else {
          // Legacy mode: pick random OLD
          const allOld = db
            .listSessions()
            .filter((s) => s.cluster === 'old' && s.autoReplyEnabled && (s.autoReplyMode || 'static') === 'script')
            .filter((s) => (s.autoReplyScriptText || '').trim().length > 0);

          const oldSessions = (automation.oldSessionNames && automation.oldSessionNames.length > 0)
            ? allOld.filter((s) => automation.oldSessionNames!.includes(s.wahaSession))
            : allOld;

          if (oldSessions.length === 0) {
            db.markScheduledTask(task.id, 'error', 'No OLD sessions available');
            continue;
          }

          chosen = pickRandom(oldSessions);
        }
          // Use session's configured parity (OLD should be 'odd', NEW should be 'even')
          const parity = chosen.scriptLineParity || (chosen.cluster === 'new' ? 'even' : 'odd');

          const progress = db.getChatProgress(chosen.wahaSession, task.chatId) || {
            seasonIndex: 0,
            lineIndex: 0,
            updatedAt: new Date().toISOString(),
          };

          const picked = pickReplyFromScript(
            chosen.autoReplyScriptText || '',
            progress.seasonIndex,
            progress.lineIndex,
            parity
          );

          if (!picked) {
            // Script habis → anggap selesai.
            db.markScheduledTask(task.id, 'sent');
            continue;
          }

          await sendTextQueued({ session: chosen.wahaSession, chatId: task.chatId, text: picked.text });
          db.setChatProgress(chosen.wahaSession, task.chatId, {
            seasonIndex: picked.nextSeasonIndex,
            lineIndex: picked.nextLineIndex,
            updatedAt: new Date().toISOString(),
          });

          db.markScheduledTask(task.id, 'sent');
        } catch (e: any) {
          db.markScheduledTask(task.id, 'error', e?.message || 'unknown');
        }
      }
    } finally {
      running = false;
    }
  }, pollIntervalMs);
}
