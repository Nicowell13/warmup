'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../../../lib/api';
import { getToken } from '../../../lib/auth';

function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20 ${props.className || ''}`}
    />
  );
}

export default function CampaignsPage() {
  const [targetsText, setTargetsText] = useState('');
  const [oldSessionsText, setOldSessionsText] = useState('old-1');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const [automationId, setAutomationId] = useState('');
  const [progress, setProgress] = useState(null);
  const [progressError, setProgressError] = useState('');

  const [prefillBusy, setPrefillBusy] = useState(false);

  const apiBase = useMemo(() => getApiBaseUrl(), []);

  function toChatId(phoneDigits) {
    const digits = String(phoneDigits || '').replace(/[^0-9]/g, '');
    if (!digits) return '';
    return `${digits}@c.us`;
  }

  async function prefillFromConnected({ overwrite } = { overwrite: false }) {
    const token = getToken();
    if (!token) return;

    setPrefillBusy(true);
    try {
      const [sessionsRes, statusRes] = await Promise.all([
        apiFetch('/sessions', { token }),
        apiFetch('/waha/sessions/status', { token }),
      ]);

      const statusMap = {};
      for (const s of statusRes?.sessions || []) {
        statusMap[s.name] = s;
      }

      const allSessions = sessionsRes?.sessions || [];

      const connectedOldNames = allSessions
        .filter((s) => (s.cluster || 'old') === 'old')
        .map((s) => s.wahaSession)
        .filter((name) => statusMap?.[name]?.connected);

      const connectedNewChatIds = allSessions
        .filter((s) => (s.cluster || 'old') === 'new')
        .map((s) => s.wahaSession)
        .filter((name) => statusMap?.[name]?.connected)
        .map((name) => toChatId(statusMap?.[name]?.phoneNumber))
        .filter(Boolean);

      if (overwrite || !(oldSessionsText || '').trim() || (oldSessionsText || '').trim() === 'old-1') {
        if (connectedOldNames.length > 0) setOldSessionsText(connectedOldNames.join('\n'));
      }

      if (overwrite || !(targetsText || '').trim()) {
        if (connectedNewChatIds.length > 0) setTargetsText(connectedNewChatIds.join('\n'));
      }
    } catch {
      // ignore (WAHA down or not configured yet)
    } finally {
      setPrefillBusy(false);
    }
  }

  useEffect(() => {
    try {
      const savedTargets = localStorage.getItem('campaigns.targetsText');
      const savedOld = localStorage.getItem('campaigns.oldSessionsText');
      const savedResult = localStorage.getItem('campaigns.lastResult');
      const savedAutomationId = localStorage.getItem('campaigns.lastAutomationId');
      if (typeof savedTargets === 'string') setTargetsText(savedTargets);
      if (typeof savedOld === 'string') setOldSessionsText(savedOld);
      if (typeof savedResult === 'string' && savedResult.trim()) {
        setResult(JSON.parse(savedResult));
      }
      if (typeof savedAutomationId === 'string') setAutomationId(savedAutomationId);
    } catch {
      // ignore
    }

    // auto-prefill on first load (won't overwrite saved values)
    prefillFromConnected({ overwrite: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('campaigns.targetsText', targetsText);
    } catch {
      // ignore
    }
  }, [targetsText]);

  useEffect(() => {
    try {
      localStorage.setItem('campaigns.oldSessionsText', oldSessionsText);
    } catch {
      // ignore
    }
  }, [oldSessionsText]);

  async function startCampaign() {
    setRunning(true);
    setError('');
    setResult(null);
    setProgress(null);
    setProgressError('');

    try {
      const newChatIds = (targetsText || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      const oldSessionNames = (oldSessionsText || '')
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);

      const data = await apiFetch('/presets/wa12/run', {
        token: getToken(),
        method: 'POST',
        body: { newChatIds, oldSessionNames },
      });
      setResult(data);

      const newAutomationId = data?.automation?.id || '';
      if (newAutomationId) {
        setAutomationId(newAutomationId);
        try {
          localStorage.setItem('campaigns.lastAutomationId', String(newAutomationId));
        } catch {
          // ignore
        }
      }
      try {
        localStorage.setItem('campaigns.lastResult', JSON.stringify(data));
      } catch {
        // ignore
      }
    } catch (e) {
      setError(e?.message || 'Gagal menjalankan campaign');
    } finally {
      setRunning(false);
    }
  }

  const results = result?.campaign?.results || result?.results || [];
  const successCount = results?.filter((r) => r.ok).length || 0;
  const totalCount = results?.length || 0;

  async function refreshProgress(currentAutomationId) {
    const token = getToken();
    if (!token) return;
    if (!currentAutomationId) return;

    try {
      const data = await apiFetch(`/automations/${currentAutomationId}/progress`, { token });
      setProgress(data);
      setProgressError('');
    } catch (e) {
      setProgressError(e?.message || 'Gagal ambil progress');
    }
  }

  useEffect(() => {
    if (!automationId) return;
    refreshProgress(automationId);
    const t = setInterval(() => refreshProgress(automationId), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automationId]);

  const summary = progress?.summary;
  const nextDueAt = summary?.nextDueAt ? new Date(summary.nextDueAt) : null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <p className="mt-1 text-sm text-gray-600">
          5 OLD sessions untuk mengirim pesan awal ke list NEW, lalu otomatis membuat schedule follow-up (day1/day2/day3).
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-base font-semibold">Start campaign</h2>
        <p className="mt-1 text-sm text-gray-600">Pilih OLD session yang sudah pairing, lalu isi daftar chatId NEW (1 baris = 1 chatId).</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">OLD session names (comma / newline)</label>
            <Textarea
              value={oldSessionsText}
              onChange={(e) => setOldSessionsText(e.target.value)}
              rows={2}
              placeholder="old-1\nold-2"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={prefillBusy}
              onClick={() => prefillFromConnected({ overwrite: true })}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {prefillBusy ? 'Mengisi...' : 'Autofill dari Sessions (connected)'}
            </button>
            <div className="text-xs text-gray-500">Mengisi OLD & target NEW dari session yang statusnya connected. Tetap bisa diedit.</div>
          </div>

          <Textarea
            value={targetsText}
            onChange={(e) => setTargetsText(e.target.value)}
            rows={7}
            placeholder="62812xxxx@c.us\n62813yyyy@c.us"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={running}
              onClick={startCampaign}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {running ? 'Menjalankan...' : 'Start Campaign + Schedule'}
            </button>

            {totalCount ? <div className="text-sm text-gray-600">Sukses: {successCount}/{totalCount}</div> : null}
          </div>

          {results?.length ? (
            <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
              <div className="mb-2 text-xs text-gray-600">Hasil</div>
              <div className="space-y-1">
                {results.map((r) => (
                  <div key={`${r.fromSession}-${r.chatId}`} className="flex flex-wrap gap-2">
                    <span className={r.ok ? 'text-green-700' : 'text-red-700'}>{r.ok ? 'OK' : 'ERR'}</span>
                    <span>
                      from <span className="font-mono">{r.fromSession}</span> to <span className="font-mono">{r.chatId}</span>
                    </span>
                    {!r.ok && r.error ? <span className="text-gray-600">— {r.error}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {typeof result?.scheduled === 'number' ? (
            <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-700">Schedule dibuat: {result.scheduled} task</div>
          ) : null}

          <div className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Live progress</h2>
                <p className="mt-1 text-sm text-gray-600">Progress diambil dengan polling dari scheduler (auto update).</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refreshProgress(automationId)}
                  disabled={!automationId}
                  className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <div>
                Automation ID: <span className="font-mono">{automationId || '-'}</span>
              </div>
              {progressError ? <div className="text-sm text-red-700">{progressError}</div> : null}

              {summary ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-600">Tasks</div>
                    <div className="mt-1">
                      Total: <span className="font-medium">{summary.total}</span>
                    </div>
                    <div>
                      Pending: <span className="font-medium">{summary.pending}</span>
                    </div>
                    <div>
                      Sent: <span className="font-medium">{summary.sent}</span>
                    </div>
                    <div>
                      Error: <span className="font-medium text-red-700">{summary.error}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-600">Next</div>
                    <div className="mt-1">
                      Next due:{' '}
                      <span className="font-medium">{nextDueAt ? nextDueAt.toLocaleString() : '-'}</span>
                    </div>
                    <div className="text-xs text-gray-500">(berdasarkan task pending tercepat)</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500">Jalankan campaign dulu untuk melihat progress.</div>
              )}

              {summary?.recentErrors?.length ? (
                <div className="rounded-xl border bg-gray-50 p-4">
                  <div className="mb-2 text-xs text-gray-600">Recent errors</div>
                  <div className="space-y-1 text-xs">
                    {summary.recentErrors.map((e, idx) => (
                      <div key={`${e.dueAt}-${idx}`} className="flex flex-wrap gap-2">
                        <span className="font-mono">{new Date(e.dueAt).toLocaleString()}</span>
                        {e.senderSession ? <span className="font-mono">{e.senderSession}</span> : null}
                        <span className="font-mono">{e.chatId}</span>
                        {e.lastError ? <span className="text-gray-600">— {e.lastError}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
