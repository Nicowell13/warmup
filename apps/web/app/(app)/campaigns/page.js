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
      if (typeof savedTargets === 'string') setTargetsText(savedTargets);
      if (typeof savedOld === 'string') setOldSessionsText(savedOld);
      if (typeof savedResult === 'string' && savedResult.trim()) {
        setResult(JSON.parse(savedResult));
      }
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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <p className="mt-1 text-sm text-gray-600">
          3 OLD → kirim pesan awal ke list NEW, lalu otomatis membuat schedule follow-up (day1/day2/day3). Endpoint API: <span className="font-mono">{apiBase}/presets/wa12/run</span>
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
        </div>
      </section>
    </div>
  );
}
