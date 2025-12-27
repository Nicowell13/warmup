'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../../../lib/api';
import { getToken } from '../../../lib/auth';

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

  const MAX_SESSIONS = 3;
  const canCreateMore = sessions.length < MAX_SESSIONS;

  const [createOpen, setCreateOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const nameInputRef = useRef(null);

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

  async function onCreateSession() {
    setError('');
    try {
      await apiFetch('/sessions', {
        token,
        method: 'POST',
        body: {
          wahaSession: newSessionName,
        },
      });
      setNewSessionName('');
      setCreateOpen(false);
      await loadSessions(token);
    } catch (e2) {
      setError(e2?.message || 'Gagal membuat session');
    }
  }

  useEffect(() => {
    if (!createOpen) return;

    const t = setTimeout(() => {
      nameInputRef.current?.focus?.();
    }, 0);

    function onKeyDown(e) {
      if (e.key === 'Escape') setCreateOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [createOpen]);

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
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">WhatsApp Sessions</h1>
            <p className="mt-1 text-sm text-gray-600">Kelola banyak nomor/season WAHA dan konfigurasi auto-reply.</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <button
              disabled={!canCreateMore}
              onClick={() => {
                setError('');
                setCreateOpen(true);
              }}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              + New Session
            </button>

            <div className="w-full sm:w-auto">
              <div className="text-xs text-gray-500">Webhook URL</div>
              <div className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-xs font-mono text-gray-800">{webhookUrl}</div>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Daftar sessions</h2>
              <p className="mt-1 text-sm text-gray-600">Edit konfigurasi auto-reply per session.</p>
            </div>
            <button onClick={() => loadSessions(token)} className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
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
                  <button onClick={() => onDeleteSession(s.id)} className="rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
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

          {!canCreateMore ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Batas pembuatan session tercapai (maks. {MAX_SESSIONS}). Hapus salah satu session jika ingin membuat baru.
            </div>
          ) : null}
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Tutup"
            onClick={() => setCreateOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-lg rounded-2xl bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="text-lg font-semibold">Buat Sesi Baru (maks. {MAX_SESSIONS})</div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-50"
                onClick={() => setCreateOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              className="space-y-4 px-6 py-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newSessionName.trim()) return;
                if (!canCreateMore) return;
                onCreateSession();
              }}
            >
              <div>
                <label className="text-sm font-medium text-gray-700">Nama Sesi</label>
                <input
                  ref={nameInputRef}
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20"
                  placeholder="Contoh: marketing-1"
                />
                <p className="mt-2 text-xs text-gray-500">Anda dapat membuat hingga {MAX_SESSIONS} sesi. Jika butuh lebih, silakan hubungi admin.</p>
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setCreateOpen(false)}
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={!newSessionName.trim() || !canCreateMore}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Buat Session
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
