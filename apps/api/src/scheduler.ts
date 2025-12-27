import { db } from './db.js';
import { pickRandom, pickReplyFromScript } from './script.js';
import { wahaSendText } from './waha.js';

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

  setInterval(async () => {
    const nowIso = new Date().toISOString();
    const due = db.listDueScheduledTasks(nowIso, batchSize);
    if (due.length === 0) return;

    for (const task of due) {
      try {
        const automation = db.getAutomationById(task.automationId);
        if (!automation?.active) {
          db.markScheduledTask(task.id, 'sent');
          continue;
        }

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

        const chosen = pickRandom(oldSessions);
        const parity = chosen.scriptLineParity || 'odd';

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

        await wahaSendText({ session: chosen.wahaSession, chatId: task.chatId, text: picked.text });
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
  }, pollIntervalMs);
}
