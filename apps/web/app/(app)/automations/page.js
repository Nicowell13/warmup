'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../../../lib/api';
import { getToken } from '../../../lib/auth';

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20 ${props.className || ''}`}
    />
  );
}

function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20 ${props.className || ''}`}
    />
  );
}

export default function AutomationsPage() {
  const [error, setError] = useState('');

  const [targetsText, setTargetsText] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [windowStart, setWindowStart] = useState('08:00');
  const [windowEnd, setWindowEnd] = useState('22:00');
  const [day1, setDay1] = useState(24);
  const [day2, setDay2] = useState(36);
  const [day3, setDay3] = useState(42);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const [automations, setAutomations] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  const apiBase = useMemo(() => getApiBaseUrl(), []);

  async function loadAutomations() {
    setLoadingList(true);
    setError('');
    try {
      const data = await apiFetch('/automations', { token: getToken() });
      setAutomations(data.automations || []);
    } catch (e) {
      setError(e?.message || 'Gagal memuat automations');
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadAutomations();
  }, []);

  async function startAutomation() {
    setRunning(true);
    setError('');
    setResult(null);

    try {
      const newChatIds = (targetsText || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      const data = await apiFetch('/automations/start', {
        token: getToken(),
        method: 'POST',
        body: {
          name: `auto-${new Date().toISOString().slice(0, 10)}`,
          timezone,
          windowStart,
          windowEnd,
          day1MessagesPerNew: Number(day1),
          day2MessagesPerNew: Number(day2),
          day3MessagesPerNew: Number(day3),
          newChatIds,
        },
      });

      setResult(data);
      await loadAutomations();
    } catch (e) {
      setError(e?.message || 'Gagal start automation');
    } finally {
      setRunning(false);
    }
  }

  async function deleteAutomation(id) {
    setError('');
    try {
      await apiFetch(`/automations/${id}`, { token: getToken(), method: 'DELETE' });
      await loadAutomations();
    } catch (e) {
      setError(e?.message || 'Gagal hapus automation');
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5">
        <h1 className="text-xl font-semibold">Automations</h1>
        <p className="mt-1 text-sm text-gray-600">
          Jadwalkan pesan otomatis dalam window jam (default 08:00–22:00). Endpoint API: <span className="font-mono">{apiBase}/automations/start</span>
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-base font-semibold">Start automation</h2>
          <p className="mt-1 text-sm text-gray-600">Target day1/day2/day3 adalah jumlah pesan per NEW chatId.</p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">List chatId NEW (1 baris)</label>
              <Textarea value={targetsText} onChange={(e) => setTargetsText(e.target.value)} rows={6} placeholder="62812xxxx@c.us\n62813yyyy@c.us" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Timezone</label>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Start</label>
                  <Input value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">End</label>
                  <Input value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Day 1</label>
                <Input type="number" value={day1} onChange={(e) => setDay1(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Day 2</label>
                <Input type="number" value={day2} onChange={(e) => setDay2(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Day 3</label>
                <Input type="number" value={day3} onChange={(e) => setDay3(e.target.value)} />
              </div>
            </div>

            <button
              disabled={running}
              onClick={startAutomation}
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {running ? 'Menjadwalkan...' : 'Start Automation'}
            </button>

            {result?.scheduled ? (
              <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-700">Task dijadwalkan: {result.scheduled}</div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Daftar automations</h2>
            <button onClick={loadAutomations} className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Refresh
            </button>
          </div>

          {loadingList ? <div className="mt-4 text-sm text-gray-600">Loading...</div> : null}

          <div className="mt-4 space-y-3">
            {automations.map((a) => (
              <div key={a.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{a.name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      tz: {a.timezone} | window: {a.windowStart}-{a.windowEnd} | newChatIds: {(a.newChatIds || []).length}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteAutomation(a.id)}
                    className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {automations.length === 0 && !loadingList ? (
              <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-700">Belum ada automation.</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
