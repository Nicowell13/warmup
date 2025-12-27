'use client';

/*






































































































































































































































































































































































































}  );    </div>      </div>        </div>          ))}            </div>              </div>                )}                  </div>                    />                      className="mt-1 min-h-[140px]"                      onBlur={(e) => onSaveSession(s.id, { autoReplyScriptText: e.target.value })}                      defaultValue={s.autoReplyScriptText || ''}                    <Textarea                    <label className="text-sm font-medium text-gray-700">Script</label>                  <div>                ) : (                  </div>                    />                      className="mt-1 min-h-[90px]"                      onBlur={(e) => onSaveSession(s.id, { autoReplyText: e.target.value })}                      defaultValue={s.autoReplyText || ''}                    <Textarea                    <label className="text-sm font-medium text-gray-700">Auto-reply text</label>                  <div>                {(s.autoReplyMode || 'static') === 'static' ? (                </div>                  ) : null}                    </div>                      </Select>                        <option value="all">all</option>                        <option value="even">even</option>                        <option value="odd">odd</option>                      >                        onChange={(e) => onSaveSession(s.id, { scriptLineParity: e.target.value })}                        value={s.scriptLineParity || 'odd'}                      <Select                      <label className="text-sm font-medium text-gray-700">Parity</label>                    <div>                  {(s.autoReplyMode || 'static') === 'script' ? (                  </div>                    </Select>                      <option value="static">static</option>                      <option value="script">script</option>                    <Select value={s.autoReplyMode || 'static'} onChange={(e) => onSaveSession(s.id, { autoReplyMode: e.target.value })}>                    <label className="text-sm font-medium text-gray-700">Mode</label>                  <div>                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">                </label>                  Auto-reply aktif                  />                    onChange={(e) => onSaveSession(s.id, { autoReplyEnabled: e.target.checked })}                    checked={!!s.autoReplyEnabled}                    className="h-4 w-4 rounded border-gray-300"                    type="checkbox"                  <input                <label className="flex items-center gap-2 text-sm text-gray-700">              <div className="mt-4 grid grid-cols-1 gap-4">              </div>                </button>                  Delete                >                  className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"                  onClick={() => onDeleteSession(s.id)}                <button                </div>                  <div className="mt-1 text-xs text-gray-500">cluster: {s.cluster || 'old'}</div>                  <div className="text-sm font-semibold text-gray-900">{s.wahaSession}</div>                <div>              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">            <div key={s.id} className="rounded-xl border p-4">          {sessions.map((s) => (        <div className="mt-4 grid grid-cols-1 gap-4">        {loading ? <div className="mt-4 text-sm text-gray-600">Loading...</div> : null}        </div>          </button>            Refresh          >            className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"            onClick={() => loadSessions(token)}          <button          <h2 className="text-base font-semibold">List Sessions</h2>        <div className="flex items-center justify-between">      <div className="rounded-2xl border bg-white p-5">      </div>        </div>          </form>            ) : null}              </div>                ) : null}                  <div className="mt-2 text-xs text-gray-600">Skipped: {bulkResult.skipped.map((s) => s.wahaSession).join(', ')}</div>                {bulkResult?.skipped?.length ? (                Selesai: dibuat <b>{bulkResult.createdCount}</b>, skip <b>{bulkResult.skippedCount}</b>              <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-700">            {bulkResult?.ok ? (            </button>              {bulkCreating ? 'Memproses...' : 'Buat Banyak Session'}            >              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"              disabled={bulkCreating}            <button            </div>              />                placeholder="season-1\nseason-2\nseason-3\n..."                className="mt-1 min-h-[180px]"                onChange={(e) => setBulkSessionNamesText(e.target.value)}                value={bulkSessionNamesText}              <Textarea              <label className="text-sm font-medium text-gray-700">Daftar nama session</label>            <div>          <form onSubmit={onBulkCreateSessions} className="mt-4 space-y-4">          <p className="mt-1 text-sm text-gray-600">1 baris = 1 session. Setting diambil dari form kiri.</p>          <h2 className="text-base font-semibold">Bulk input (mis. 12 nomor/season)</h2>        <div className="rounded-2xl border bg-white p-5">        </div>          </form>            </button>              Buat Session            <button className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">            )}              </div>                />                  placeholder="Season 1 line 1\nSeason 1 line 2\n\nSeason 2 line 1\n..."                  className="mt-2 min-h-[180px]"                  onChange={(e) => setNewAutoReplyScriptText(e.target.value)}                  value={newAutoReplyScriptText}                <Textarea                <p className="mt-1 text-xs text-gray-500">Pisahkan antar season pakai 1 baris kosong.</p>                <label className="text-sm font-medium text-gray-700">Script multi-season</label>              <div>            ) : (              </div>                <Textarea value={newAutoReplyText} onChange={(e) => setNewAutoReplyText(e.target.value)} className="mt-1 min-h-[90px]" />                <label className="text-sm font-medium text-gray-700">Teks Auto-reply (static)</label>              <div>            {newAutoReplyMode === 'static' ? (            ) : null}              </div>                </Select>                  <option value="all">all (semua baris)</option>                  <option value="even">even (2,4,6...)</option>                  <option value="odd">odd (1,3,5...)</option>                <Select value={newScriptLineParity} onChange={(e) => setNewScriptLineParity(e.target.value)} className="mt-2">                <p className="mt-1 text-xs text-gray-500">Untuk dialog 2 orang: odd = baris 1,3,5... (biasanya old).</p>                <label className="text-sm font-medium text-gray-700">Baris yang dikirim (parity)</label>              <div>            {newAutoReplyMode === 'script' ? (            </label>              Auto-reply aktif              />                onChange={(e) => setNewAutoReplyEnabled(e.target.checked)}                checked={newAutoReplyEnabled}                className="h-4 w-4 rounded border-gray-300"                type="checkbox"              <input            <label className="flex items-center gap-2 text-sm text-gray-700">            </div>              </div>                </Select>                  <option value="static">Static (1 teks)</option>                  <option value="script">Script (multi-season)</option>                <Select value={newAutoReplyMode} onChange={(e) => setNewAutoReplyMode(e.target.value)}>                <label className="text-sm font-medium text-gray-700">Mode auto-reply</label>              <div>              </div>                </Select>                  <option value="new">new</option>                  <option value="old">old</option>                <Select value={newCluster} onChange={(e) => setNewCluster(e.target.value)}>                <label className="text-sm font-medium text-gray-700">Cluster nomor</label>              <div>            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">            </div>              <Input value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="contoh: season-1" />              <label className="text-sm font-medium text-gray-700">Nama Session (WAHA)</label>            <div>          <form onSubmit={onCreateSession} className="mt-4 space-y-4">          <h2 className="text-base font-semibold">Buat Session</h2>        <div className="rounded-2xl border bg-white p-5">      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">      ) : null}        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>      {error ? (      </div>        </div>          </div>            <div className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-xs font-mono text-gray-800">{webhookUrl}</div>            <div className="text-xs text-gray-500">Webhook URL</div>          <div className="mt-3 sm:mt-0">          </div>            <p className="text-sm text-gray-600">Kelola banyak nomor/season WAHA dan konfigurasi auto-reply.</p>            <h1 className="text-xl font-semibold">Sessions</h1>          <div>        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">      <div className="rounded-2xl border bg-white p-5">    <div className="space-y-6">  return (  }    }      setError(e?.message || 'Gagal menghapus');    } catch (e) {      await loadSessions(token);      await apiFetch(`/sessions/${sessionId}`, { token, method: 'DELETE' });    try {    setError('');  async function onDeleteSession(sessionId) {  }    }      setError(e?.message || 'Gagal menyimpan');    } catch (e) {      await loadSessions(token);      await apiFetch(`/sessions/${sessionId}`, { token, method: 'PATCH', body: patch });    try {    setError('');  async function onSaveSession(sessionId, patch) {  }    }      setBulkCreating(false);    } finally {      setError(e2?.message || 'Gagal bulk create');    } catch (e2) {      await loadSessions(token);      setBulkResult(data);      });        },          autoReplyScriptText: newAutoReplyScriptText,          autoReplyText: newAutoReplyText,          scriptLineParity: newScriptLineParity,          autoReplyMode: newAutoReplyMode,          autoReplyEnabled: newAutoReplyEnabled,          cluster: newCluster,          wahaSessions,        body: {        method: 'POST',        token,      const data = await apiFetch('/sessions/bulk', {    try {    setBulkCreating(true);    }      return;      setError('Masukkan minimal 1 nama session.');    if (wahaSessions.length === 0) {      .filter(Boolean);      .map((s) => s.trim())      .split(/\r?\n/)    const wahaSessions = (bulkSessionNamesText || '')    setBulkResult(null);    setError('');    e.preventDefault();  async function onBulkCreateSessions(e) {  }    }      setError(e2?.message || 'Gagal membuat session');    } catch (e2) {      await loadSessions(token);      setNewSessionName('');      });        },          autoReplyScriptText: newAutoReplyScriptText,          autoReplyText: newAutoReplyText,          scriptLineParity: newScriptLineParity,          autoReplyMode: newAutoReplyMode,          autoReplyEnabled: newAutoReplyEnabled,          cluster: newCluster,          wahaSession: newSessionName,        body: {        method: 'POST',        token,      await apiFetch('/sessions', {    try {    setError('');    e.preventDefault();  async function onCreateSession(e) {  }, [token]);    loadSessions(token);    if (!token) return;  useEffect(() => {  }    }      setLoading(false);    } finally {      setError(msg);      }        return;        router.replace('/login');        clearToken();      if (String(msg).includes('401')) {      const msg = e?.message || 'Gagal memuat sessions';    } catch (e) {      setSessions(data.sessions || []);      const data = await apiFetch('/sessions', { token: currentToken });    try {    setLoading(true);    setError('');  async function loadSessions(currentToken) {  }, [router]);    setToken(t);    }      return;      router.replace('/login');    if (!t) {    const t = getToken();  useEffect(() => {  const webhookUrl = useMemo(() => `${getApiBaseUrl()}/waha/webhook`, []);  const [bulkResult, setBulkResult] = useState(null);  const [bulkCreating, setBulkCreating] = useState(false);  const [bulkSessionNamesText, setBulkSessionNamesText] = useState('');  const [newAutoReplyScriptText, setNewAutoReplyScriptText] = useState('');  const [newAutoReplyText, setNewAutoReplyText] = useState('Terima kasih, pesan Anda sudah kami terima.');  const [newScriptLineParity, setNewScriptLineParity] = useState('odd');  const [newAutoReplyMode, setNewAutoReplyMode] = useState('script');  const [newAutoReplyEnabled, setNewAutoReplyEnabled] = useState(true);  const [newCluster, setNewCluster] = useState('old');  const [newSessionName, setNewSessionName] = useState('');  const [sessions, setSessions] = useState([]);  const [error, setError] = useState('');  const [loading, setLoading] = useState(true);  const [token, setToken] = useState('');  const router = useRouter();export default function SessionsPage() {}  );    />      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20 ${className || ''}`}      {...props}    <select  return (function Select({ className, ...props }) {}  );    />      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20 ${className || ''}`}      {...props}    <input  return (function Input({ className, ...props }) {}  );    />      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20 ${className || ''}`}      {...props}    <textarea  return (function Textarea({ className, ...props }) {import { useRouter } from 'next/navigation';import { getToken, clearToken } from '../../../lib/auth';import { apiFetch, getApiBaseUrl } from '../../../lib/api';import { useEffect, useMemo, useState } from 'react';
*/

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../../../lib/api';
import { getToken } from '../../../lib/auth';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function parseLines(text) {
  return (text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function SessionsPage() {
  const [token, setToken] = useState('');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newSessionName, setNewSessionName] = useState('');
  const [newCluster, setNewCluster] = useState('old');
  const [newAutoReplyEnabled, setNewAutoReplyEnabled] = useState(false);
  const [newAutoReplyMode, setNewAutoReplyMode] = useState('script');
  const [newScriptLineParity, setNewScriptLineParity] = useState('odd');
  const [newAutoReplyText, setNewAutoReplyText] = useState('Terima kasih, pesan Anda sudah kami terima.');
  const [newAutoReplyScriptText, setNewAutoReplyScriptText] = useState('');

  const [bulkSessionNamesText, setBulkSessionNamesText] = useState('');
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const webhookUrl = useMemo(() => `${getApiBaseUrl()}/waha/webhook`, []);

  useEffect(() => {
    setToken(getToken());
  }, []);

  async function loadSessions(currentToken) {
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/sessions', { token: currentToken });
      setSessions(data.sessions || []);
    } catch (e) {
      setError(e?.message || 'Gagal memuat sessions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    loadSessions(token);
  }, [token]);

  async function onCreateSession(e) {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/sessions', {
        token,
        method: 'POST',
        body: {
          wahaSession: newSessionName,
          cluster: newCluster,
          autoReplyEnabled: newAutoReplyEnabled,
          autoReplyMode: newAutoReplyMode,
          scriptLineParity: newScriptLineParity,
          autoReplyText: newAutoReplyText,
          autoReplyScriptText: newAutoReplyScriptText,
        },
      });
      setNewSessionName('');
      await loadSessions(token);
    } catch (e2) {
      setError(e2?.message || 'Gagal membuat session');
    }
  }

  async function onBulkCreateSessions(e) {
    e.preventDefault();
    setError('');
    setBulkResult(null);

    const wahaSessions = parseLines(bulkSessionNamesText);
    if (wahaSessions.length === 0) {
      setError('Masukkan minimal 1 nama session.');
      return;
    }

    setBulkCreating(true);
    try {
      const data = await apiFetch('/sessions/bulk', {
        token,
        method: 'POST',
        body: {
          wahaSessions,
          cluster: newCluster,
          autoReplyEnabled: newAutoReplyEnabled,
          autoReplyMode: newAutoReplyMode,
          scriptLineParity: newScriptLineParity,
          autoReplyText: newAutoReplyText,
          autoReplyScriptText: newAutoReplyScriptText,
        },
      });
      setBulkResult(data);
      await loadSessions(token);
    } catch (e2) {
      setError(e2?.message || 'Gagal bulk create');
    } finally {
      setBulkCreating(false);
    }
  }

  async function onSaveSession(sessionId, patch) {
    setError('');
    try {
      await apiFetch(`/sessions/${sessionId}`, { token, method: 'PATCH', body: patch });
      await loadSessions(token);
    } catch (e) {
      setError(e?.message || 'Gagal menyimpan');
    }
  }

  async function onDeleteSession(sessionId) {
    setError('');
    try {
      await apiFetch(`/sessions/${sessionId}`, { token, method: 'DELETE' });
      await loadSessions(token);
    } catch (e) {
      setError(e?.message || 'Gagal menghapus');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Sessions</h1>
        <p className="mt-1 text-sm text-gray-600">
          Webhook URL untuk WAHA: <span className="font-mono">{webhookUrl}</span>
        </p>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-base font-semibold">Buat session</h2>
          <p className="mt-1 text-sm text-gray-600">Buat satu session atau bulk (12 session) dengan setting yang sama.</p>

          <form onSubmit={onCreateSession} className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Nama session (WAHA)</label>
              <input
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20"
                placeholder="contoh: season-1"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Cluster</label>
                <select
                  value={newCluster}
                  onChange={(e) => setNewCluster(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="old">old</option>
                  <option value="new">new</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mode</label>
                <select
                  value={newAutoReplyMode}
                  onChange={(e) => setNewAutoReplyMode(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="script">Script (multi-season)</option>
                  <option value="static">Static (1 teks)</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={newAutoReplyEnabled}
                onChange={(e) => setNewAutoReplyEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              Auto-reply aktif
            </label>

            {newAutoReplyMode === 'script' ? (
              <div>
                <label className="text-sm font-medium text-gray-700">Parity (untuk dialog 2 orang)</label>
                <select
                  value={newScriptLineParity}
                  onChange={(e) => setNewScriptLineParity(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="odd">odd (1,3,5...)</option>
                  <option value="even">even (2,4,6...)</option>
                  <option value="all">all (semua baris)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">Umumnya: old = odd, new = even.</p>
              </div>
            ) : null}

            {newAutoReplyMode === 'static' ? (
              <div>
                <label className="text-sm font-medium text-gray-700">Teks auto-reply</label>
                <textarea
                  value={newAutoReplyText}
                  onChange={(e) => setNewAutoReplyText(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  rows={4}
                />
              </div>
            ) : (
              <div>
                <label className="textlable text-sm font-medium text-gray-700">Script multi-season</label>
                <p className="mt-1 text-xs text-gray-500">Pisahkan antar season dengan 1 baris kosong. Tiap pesan masuk akan memajukan baris.</p>
                <textarea
                  value={newAutoReplyScriptText}
                  onChange={(e) => setNewAutoReplyScriptText(e.target.value)}
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                  rows={8}
                  placeholder="Season 1 line 1\nSeason 1 line 2\n\nSeason 2 line 1\n..."
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">Buat 1 session</button>
              <button
                type="button"
                onClick={() => {
                  setNewSessionName('');
                  setNewCluster('old');
                  setNewAutoReplyEnabled(false);
                  setNewAutoReplyMode('script');
                  setNewScriptLineParity('odd');
                  setNewAutoReplyText('Terima kasih, pesan Anda sudah kami terima.');
                  setNewAutoReplyScriptText('');
                }}
                className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </form>

          <div className="mt-6 border-t pt-5">
            <h3 className="text-sm font-semibold">Bulk input (mis. 12 session)</h3>
            <form onSubmit={onBulkCreateSessions} className="mt-3 space-y-3">
              <textarea
                value={bulkSessionNamesText}
                onChange={(e) => setBulkSessionNamesText(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                rows={6}
                placeholder={'season-1\nseason-2\nseason-3\n...'}
              />
              <button
                disabled={bulkCreating}
                className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              >
                {bulkCreating ? 'Memproses...' : 'Buat banyak session'}
              </button>

              {bulkResult?.ok ? (
                <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  Selesai: dibuat {bulkResult.createdCount}, skip {bulkResult.skippedCount}
                </div>
              ) : null}
              {bulkResult?.skipped?.length ? (
                <div className="text-xs text-gray-500">
                  Skipped (sudah ada): {bulkResult.skipped.map((s) => s.wahaSession).join(', ')}
                </div>
              ) : null}
            </form>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Daftar sessions</h2>
              <p className="mt-1 text-sm text-gray-600">Edit konfigurasi auto-reply per session.</p>
            </div>
            <button
              onClick={() => loadSessions(token)}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {loading ? <div className="mt-4 text-sm text-gray-600">Loading...</div> : null}

          <div className="mt-4 space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{s.wahaSession}</div>
                    <div className="mt-0.5 text-xs text-gray-500">cluster: {s.cluster || 'old'}</div>
                  </div>
                  <button
                    onClick={() => onDeleteSession(s.id)}
                    className="rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Delete
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!s.autoReplyEnabled}
                      onChange={(e) => onSaveSession(s.id, { autoReplyEnabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Auto-reply aktif
                  </label>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Mode</label>
                      <select
                        value={s.autoReplyMode || 'static'}
                        onChange={(e) => onSaveSession(s.id, { autoReplyMode: e.target.value })}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="script">script</option>
                        <option value="static">static</option>
                      </select>
                    </div>

                    {(s.autoReplyMode || 'static') === 'script' ? (
                      <div>
                        <label className="text-sm font-medium text-gray-700">Parity</label>
                        <select
                          value={s.scriptLineParity || 'odd'}
                          onChange={(e) => onSaveSession(s.id, { scriptLineParity: e.target.value })}
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                        >
                          <option value="odd">odd</option>
                          <option value="even">even</option>
                          <option value="all">all</option>
                        </select>
                      </div>
                    ) : null}
                  </div>

                  {(s.autoReplyMode || 'static') === 'static' ? (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Auto-reply text</label>
                      <textarea
                        defaultValue={s.autoReplyText || ''}
                        onBlur={(e) => onSaveSession(s.id, { autoReplyText: e.target.value })}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                        rows={3}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Script</label>
                      <textarea
                        defaultValue={s.autoReplyScriptText || ''}
                        onBlur={(e) => onSaveSession(s.id, { autoReplyScriptText: e.target.value })}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                        rows={6}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sessions.length === 0 && !loading ? (
              <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-700">Belum ada session.</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
