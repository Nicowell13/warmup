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

  const [initBusy, setInitBusy] = useState(false);

  const MAX_SESSIONS = 12;
  const canCreateMore = sessions.length < MAX_SESSIONS;

  const [createOpen, setCreateOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const nameInputRef = useRef(null);

  const [authOpen, setAuthOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSessionName, setAuthSessionName] = useState('');
  const [qr, setQr] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState('');

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
      const createdName = newSessionName.trim();
      await apiFetch('/sessions', {
        token,
        method: 'POST',
        body: {
          wahaSession: createdName,
        },
      });
      setNewSessionName('');
      setCreateOpen(false);
      await loadSessions(token);

      // langsung buka auth popup agar season siap dipakai
      await openAuthForSession(createdName);
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

  useEffect(() => {
    if (!authOpen) return;

    function onKeyDown(e) {
      if (e.key === 'Escape') setAuthOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [authOpen]);

  function readCachedPairing(sessionName) {
    try {
      const raw = localStorage.getItem(`pairing:${sessionName}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.code !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCachedPairing(sessionName, payload) {
    try {
      localStorage.setItem(`pairing:${sessionName}`, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  async function startWahaSession(sessionName) {
    await apiFetch(`/waha/sessions/${encodeURIComponent(sessionName)}/start`, {
      token,
      method: 'POST',
    });
  }

  async function fetchQr(sessionName) {
    const data = await apiFetch(`/waha/sessions/${encodeURIComponent(sessionName)}/qr`, {
      token,
      method: 'GET',
    });
    return data;
  }

  async function openAuthForSession(sessionName) {
    if (!sessionName) return;
    setAuthOpen(true);
    setAuthSessionName(sessionName);
    setAuthError('');
    setQr(null);

    const cached = typeof window !== 'undefined' ? readCachedPairing(sessionName) : null;
    setPairingCode(cached?.code || '');
    setPhoneNumber(cached?.phoneNumber || '');

    setAuthBusy(true);
    try {
      try {
        await startWahaSession(sessionName);
      } catch (e) {
        setAuthError(`Start session gagal: ${e?.message || 'Unknown error'}`);
        return;
      }

      // WAHA kadang butuh jeda setelah start sebelum QR tersedia
      let lastErr = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const qrData = await fetchQr(sessionName);
          setQr(qrData);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const msg = String(e?.message || '');
          const retriable = msg.includes('404') || msg.toLowerCase().includes('session not found');
          if (!retriable) break;
          await new Promise((r) => setTimeout(r, 800));
        }
      }

      if (lastErr && !qr) {
        setAuthError(`Ambil QR gagal: ${lastErr?.message || 'Unknown error'}`);
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function refreshQr() {
    if (!authSessionName) return;
    setAuthBusy(true);
    setAuthError('');
    setQr(null);
    try {
      await startWahaSession(authSessionName);
      let lastErr = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const qrData = await fetchQr(authSessionName);
          setQr(qrData);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const msg = String(e?.message || '');
          const retriable = msg.includes('404') || msg.toLowerCase().includes('session not found');
          if (!retriable) break;
          await new Promise((r) => setTimeout(r, 800));
        }
      }
      if (lastErr) setAuthError(`Ambil QR gagal: ${lastErr?.message || 'Unknown error'}`);
    } catch (e) {
      setAuthError(e?.message || 'Gagal ambil QR');
    } finally {
      setAuthBusy(false);
    }
  }

  async function requestPairing() {
    if (!authSessionName) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const data = await apiFetch(`/waha/sessions/${encodeURIComponent(authSessionName)}/pairing-code`, {
        token,
        method: 'POST',
        body: { phoneNumber },
      });
      const code = data.code || '';
      setPairingCode(code);
      if (code) {
        writeCachedPairing(authSessionName, {
          code,
          phoneNumber,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      setAuthError(e?.message || 'Gagal request pairing code');
    } finally {
      setAuthBusy(false);
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

  async function initWa12Preset() {
    setInitBusy(true);
    setError('');
    try {
      await apiFetch('/presets/wa12/init', { token, method: 'POST' });
      await loadSessions(token);
    } catch (e) {
      setError(e?.message || 'Gagal init preset');
    } finally {
      setInitBusy(false);
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
              disabled={initBusy}
              onClick={initWa12Preset}
              className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {initBusy ? 'Menyiapkan...' : 'Init WA12 (3 old, 9 new)'}
            </button>

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
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openAuthForSession(s.wahaSession)}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                    >
                      Scan QR
                    </button>
                    <button onClick={() => onDeleteSession(s.id)} className="rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      Delete
                    </button>
                  </div>
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

                  <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    Mode auto-reply memakai preset (script). Anda cukup pairing 12 session lalu jalankan campaign.
                  </div>
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
                  Buat Sessions
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Tutup"
            onClick={() => setAuthOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-2xl rounded-2xl bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <div className="text-lg font-semibold">Pairing Code</div>
                <div className="mt-0.5 text-xs text-gray-500">Session: {authSessionName}</div>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-50"
                onClick={() => setAuthOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 px-6 py-5 md:grid-cols-[300px_1fr]">
              <div>
                <div className="text-sm font-medium text-gray-800">QR</div>
                <div className="mt-2 rounded-xl border bg-gray-50 p-3">
                  {qr?.data && qr?.mimetype ? (
                    <img
                      alt="WAHA QR"
                      src={`data:${qr.mimetype};base64,${qr.data}`}
                      className="h-[260px] w-[260px] rounded-lg border bg-white"
                    />
                  ) : (
                    <div className="flex h-[260px] w-[260px] items-center justify-center text-center text-xs text-gray-600">
                      {authBusy ? 'Memuat QR...' : 'QR gagal muncul. Silakan lakukan pairing menggunakan code.'}
                    </div>
                  )}
                </div>

                <button
                  disabled={authBusy || !authSessionName}
                  onClick={refreshQr}
                  className="mt-3 w-full rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Refresh QR
                </button>
              </div>

              <div className="space-y-3">
                {authError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{authError}</div>
                ) : null}

                <div className="text-sm text-gray-700">
                  Nomor Telepon (contoh: 6281234567890)
                </div>
                <input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20"
                  placeholder="Contoh: 6281234567890"
                />

                <button
                  disabled={authBusy || !authSessionName || !phoneNumber.trim() || !!pairingCode}
                  onClick={requestPairing}
                  className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Minta Kode Pairing
                </button>

                <div className="text-xs text-gray-500">
                  Format: Awali dengan kode negara tanpa tanda '+', misal Indonesia 62, lalu nomor.
                </div>
                <div className="text-xs text-gray-500">Dialog akan tetap terbuka sampai status terhubung.</div>

                {pairingCode ? (
                  <div className="mt-2 rounded-xl border bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-600">Pairing code</div>
                    <div className="mt-1 text-2xl font-semibold tracking-wider text-gray-900">{pairingCode}</div>
                    <div className="mt-2 text-xs text-gray-500">Kode disimpan untuk session ini (cukup request 1 kali).</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
