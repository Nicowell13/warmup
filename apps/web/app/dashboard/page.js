'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

async function apiFetch(path, { token, method, body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Request gagal');
  }
  return data;
}

export default function DashboardPage() {
  const router = useRouter();
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

  const [campaignTargetsText, setCampaignTargetsText] = useState('');
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignResult, setCampaignResult] = useState(null);

  const [autoTargetsText, setAutoTargetsText] = useState('');
  const [autoTimezone, setAutoTimezone] = useState('Asia/Jakarta');
  const [autoWindowStart, setAutoWindowStart] = useState('08:00');
  const [autoWindowEnd, setAutoWindowEnd] = useState('22:00');
  const [autoDay1, setAutoDay1] = useState(24);
  const [autoDay2, setAutoDay2] = useState(36);
  const [autoDay3, setAutoDay3] = useState(42);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoResult, setAutoResult] = useState(null);

  const [wahaSessionName, setWahaSessionName] = useState('');
  const [wahaPhoneNumber, setWahaPhoneNumber] = useState('');
  const [wahaQr, setWahaQr] = useState(null);
  const [wahaPairingCode, setWahaPairingCode] = useState('');
  const [wahaBusy, setWahaBusy] = useState(false);

  const webhookInfo = useMemo(() => {
    return {
      url: `${API_BASE_URL}/waha/webhook`,
    };
  }, []);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  async function loadSessions(currentToken) {
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/sessions', { token: currentToken });
      setSessions(data.sessions || []);
    } catch (err) {
      if ((err?.message || '').includes('401')) {
        localStorage.removeItem('token');
        router.replace('/login');
        return;
      }
      setError(err?.message || 'Gagal memuat sessions');
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
      setNewCluster('old');
      setNewAutoReplyEnabled(false);
      setNewAutoReplyMode('script');
      setNewScriptLineParity('odd');
      setNewAutoReplyText('Terima kasih, pesan Anda sudah kami terima.');
      setNewAutoReplyScriptText('');
      await loadSessions(token);
    } catch (err) {
      setError(err?.message || 'Gagal membuat session');
    }
  }

  async function onSaveSession(sessionId, patch) {
    setError('');
    try {
      await apiFetch(`/sessions/${sessionId}`, { token, method: 'PATCH', body: patch });
      await loadSessions(token);
    } catch (err) {
      setError(err?.message || 'Gagal menyimpan');
    }
  }

  async function onDeleteSession(sessionId) {
    setError('');
    try {
      await apiFetch(`/sessions/${sessionId}`, { token, method: 'DELETE' });
      await loadSessions(token);
    } catch (err) {
      setError(err?.message || 'Gagal menghapus');
    }
  }

  function logout() {
    localStorage.removeItem('token');
    router.replace('/login');
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Dashboard</h1>
        <button onClick={logout} style={{ padding: 8 }}>
          Logout
        </button>
      </div>

      <p style={{ marginTop: 0, color: '#555' }}>
        Webhook URL untuk WAHA: <code>{webhookInfo.url}</code>
      </p>

      {error ? <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div> : null}

      <section style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>WAHA Login Session (QR + Pairing Code)</h2>
        <p style={{ marginTop: 0, color: '#555' }}>
          Sesuai docs WAHA: ambil QR dari <code>/api/{'{session}'}/auth/qr</code>, dan fallback pairing code via{' '}
          <code>/api/{'{session}'}/auth/request-code</code>.
        </p>

        <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
          <label>
            Nama session WAHA
            <input
              value={wahaSessionName}
              onChange={(e) => setWahaSessionName(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
              placeholder="contoh: old-1"
            />
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              disabled={wahaBusy || !wahaSessionName.trim()}
              onClick={async () => {
                setWahaBusy(true);
                setError('');
                try {
                  await apiFetch(`/waha/sessions/${encodeURIComponent(wahaSessionName)}/start`, {
                    token,
                    method: 'POST',
                  });
                } catch (e) {
                  setError(e?.message || 'Gagal start session WAHA');
                } finally {
                  setWahaBusy(false);
                }
              }}
              style={{ padding: 10 }}
            >
              Start Session
            </button>

            <button
              disabled={wahaBusy || !wahaSessionName.trim()}
              onClick={async () => {
                setWahaBusy(true);
                setError('');
                setWahaQr(null);
                try {
                  const data = await apiFetch(`/waha/sessions/${encodeURIComponent(wahaSessionName)}/qr`, {
                    token,
                    method: 'GET',
                  });
                  setWahaQr(data);
                } catch (e) {
                  setError(e?.message || 'Gagal ambil QR');
                } finally {
                  setWahaBusy(false);
                }
              }}
              style={{ padding: 10 }}
            >
              Get QR
            </button>
          </div>

          {wahaQr?.data && wahaQr?.mimetype ? (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>Scan QR ini di WhatsApp (Linked devices).</div>
              <img
                alt="WAHA QR"
                src={`data:${wahaQr.mimetype};base64,${wahaQr.data}`}
                style={{ width: 260, height: 260, border: '1px solid #eee' }}
              />
            </div>
          ) : null}

          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '10px 0' }} />

          <label>
            Phone number untuk pairing code (tanpa +)
            <input
              value={wahaPhoneNumber}
              onChange={(e) => setWahaPhoneNumber(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
              placeholder="contoh: 62812xxxxxxx"
            />
          </label>

          <button
            disabled={wahaBusy || !wahaSessionName.trim() || !wahaPhoneNumber.trim()}
            onClick={async () => {
              setWahaBusy(true);
              setError('');
              setWahaPairingCode('');
              try {
                const data = await apiFetch(`/waha/sessions/${encodeURIComponent(wahaSessionName)}/pairing-code`, {
                  token,
                  method: 'POST',
                  body: { phoneNumber: wahaPhoneNumber.trim() },
                });
                setWahaPairingCode(data.code || '');
              } catch (e) {
                setError(e?.message || 'Gagal request pairing code');
              } finally {
                setWahaBusy(false);
              }
            }}
            style={{ padding: 10, width: 220 }}
          >
            Get Pairing Code
          </button>

          {wahaPairingCode ? (
            <div style={{ marginTop: 6 }}>
              Pairing code: <code style={{ fontSize: 18 }}>{wahaPairingCode}</code>
            </div>
          ) : null}
        </div>
      </section>

      <section style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Automation (08:00–22:00)</h2>
        <p style={{ marginTop: 0, color: '#555' }}>
          Menjadwalkan pengiriman pesan otomatis dari session <b>old</b> secara random ke setiap nomor <b>new</b>.
        </p>

        <div style={{ display: 'grid', gap: 10, maxWidth: 700 }}>
          <label>
            Timezone
            <input
              value={autoTimezone}
              onChange={(e) => setAutoTimezone(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
              placeholder="Asia/Jakarta"
            />
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ flex: 1 }}>
              Window start (HH:mm)
              <input
                value={autoWindowStart}
                onChange={(e) => setAutoWindowStart(e.target.value)}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
                placeholder="08:00"
              />
            </label>
            <label style={{ flex: 1 }}>
              Window end (HH:mm)
              <input
                value={autoWindowEnd}
                onChange={(e) => setAutoWindowEnd(e.target.value)}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
                placeholder="22:00"
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ flex: 1 }}>
              Day 1 messages / new
              <input
                type="number"
                value={autoDay1}
                onChange={(e) => setAutoDay1(Number(e.target.value))}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              />
            </label>
            <label style={{ flex: 1 }}>
              Day 2 messages / new
              <input
                type="number"
                value={autoDay2}
                onChange={(e) => setAutoDay2(Number(e.target.value))}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              />
            </label>
            <label style={{ flex: 1 }}>
              Day 3 messages / new
              <input
                type="number"
                value={autoDay3}
                onChange={(e) => setAutoDay3(Number(e.target.value))}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              />
            </label>
          </div>

          <label>
            Target new chatId (1 per baris)
            <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
              Setiap chatId akan menerima jumlah pesan sesuai Day 1/2/3.
            </div>
            <textarea
              value={autoTargetsText}
              onChange={(e) => setAutoTargetsText(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 8, minHeight: 120 }}
              placeholder="62812xxxxxxx@c.us\n62813xxxxxxx@c.us\n..."
            />
          </label>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              disabled={autoRunning || !autoTargetsText.trim()}
              onClick={async () => {
                setAutoRunning(true);
                setError('');
                setAutoResult(null);
                try {
                  const newChatIds = autoTargetsText
                    .replace(/\r\n/g, '\n')
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean);

                  const data = await apiFetch('/automations/start', {
                    token,
                    method: 'POST',
                    body: {
                      timezone: autoTimezone,
                      windowStart: autoWindowStart,
                      windowEnd: autoWindowEnd,
                      day1MessagesPerNew: autoDay1,
                      day2MessagesPerNew: autoDay2,
                      day3MessagesPerNew: autoDay3,
                      newChatIds,
                    },
                  });
                  setAutoResult(data);
                } catch (e) {
                  setError(e?.message || 'Gagal start automation');
                } finally {
                  setAutoRunning(false);
                }
              }}
              style={{ padding: 10 }}
            >
              {autoRunning ? 'Membuat jadwal...' : 'Start Automation'}
            </button>

            {autoResult?.scheduled != null ? (
              <span style={{ color: '#555' }}>Scheduled tasks: {autoResult.scheduled}</span>
            ) : null}
          </div>

          {autoResult?.automation ? (
            <div style={{ color: '#666', fontSize: 12 }}>
              Active automation: <code>{autoResult.automation.id}</code> (startDate: {autoResult.automation.startDate})
            </div>
          ) : null}
        </div>
      </section>

      <section style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Campaign (OLD ➜ NEW)</h2>
        <p style={{ marginTop: 0, color: '#555' }}>
          Kirim pesan awal secara random dari session cluster <b>old</b> (mode script) ke daftar target chatId.
        </p>

        <label style={{ display: 'block', maxWidth: 700 }}>
          Target chatId (1 per baris)
          <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
            Contoh format umum: <code>62812xxxxxxx@c.us</code>
          </div>
          <textarea
            value={campaignTargetsText}
            onChange={(e) => setCampaignTargetsText(e.target.value)}
            style={{ width: '100%', padding: 8, marginTop: 8, minHeight: 120 }}
            placeholder="62812xxxxxxx@c.us\n62813xxxxxxx@c.us\n..."
          />
        </label>

        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            disabled={campaignRunning || !campaignTargetsText.trim()}
            onClick={async () => {
              setCampaignRunning(true);
              setError('');
              setCampaignResult(null);
              try {
                const newChatIds = campaignTargetsText
                  .replace(/\r\n/g, '\n')
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean);

                const data = await apiFetch('/campaigns/start', {
                  token,
                  method: 'POST',
                  body: { newChatIds },
                });
                setCampaignResult(data);
              } catch (e) {
                setError(e?.message || 'Gagal menjalankan campaign');
              } finally {
                setCampaignRunning(false);
              }
            }}
            style={{ padding: 10 }}
          >
            {campaignRunning ? 'Menjalankan...' : 'Start Campaign'}
          </button>

          {campaignResult?.results ? (
            <span style={{ color: '#555' }}>
              Selesai: {campaignResult.results.filter((r) => r.ok).length}/{campaignResult.results.length} sukses
            </span>
          ) : null}
        </div>

        {campaignResult?.results ? (
          <div style={{ marginTop: 10, color: '#666', fontSize: 12, maxWidth: 900 }}>
            {campaignResult.results.map((r) => (
              <div key={`${r.fromSession}-${r.chatId}`}>
                {r.ok ? 'OK' : 'ERR'} — from <code>{r.fromSession}</code> to <code>{r.chatId}</code>
                {!r.ok && r.error ? ` — ${r.error}` : ''}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Buat Session Baru</h2>
        <form onSubmit={onCreateSession} style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
          <label>
            Nama Session (WAHA)
            <input
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
              placeholder="contoh: season-1"
            />
          </label>

          <label>
            Cluster nomor
            <select
              value={newCluster}
              onChange={(e) => setNewCluster(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
            >
              <option value="old">old</option>
              <option value="new">new</option>
            </select>
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={newAutoReplyEnabled}
              onChange={(e) => setNewAutoReplyEnabled(e.target.checked)}
            />
            Auto-reply aktif
          </label>

          <label>
            Mode auto-reply
            <select
              value={newAutoReplyMode}
              onChange={(e) => setNewAutoReplyMode(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
            >
              <option value="script">Script (multi-season)</option>
              <option value="static">Static (1 teks)</option>
            </select>
          </label>

          {newAutoReplyMode === 'script' ? (
            <label>
              Baris yang dikirim (parity)
              <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                Untuk dialog 2 orang: <b>odd</b> = baris 1,3,5... (biasanya "old"); <b>even</b> = baris 2,4,6...
              </div>
              <select
                value={newScriptLineParity}
                onChange={(e) => setNewScriptLineParity(e.target.value)}
                style={{ width: '100%', padding: 8, marginTop: 8 }}
              >
                <option value="odd">odd (1,3,5...)</option>
                <option value="even">even (2,4,6...)</option>
                <option value="all">all (semua baris)</option>
              </select>
            </label>
          ) : null}

          {newAutoReplyMode === 'static' ? (
            <label>
              Teks Auto-reply (static)
              <textarea
                value={newAutoReplyText}
                onChange={(e) => setNewAutoReplyText(e.target.value)}
                style={{ width: '100%', padding: 8, marginTop: 4, minHeight: 80 }}
              />
            </label>
          ) : (
            <label>
              Script multi-season
              <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                Pisahkan antar season pakai 1 baris kosong. Tiap baris akan dikirim berurutan setiap ada pesan masuk.
              </div>
              <textarea
                value={newAutoReplyScriptText}
                onChange={(e) => setNewAutoReplyScriptText(e.target.value)}
                style={{ width: '100%', padding: 8, marginTop: 8, minHeight: 160 }}
                placeholder="Season 1 line 1\nSeason 1 line 2\n\nSeason 2 line 1\n..."
              />
            </label>
          )}

          <button type="submit" style={{ padding: 10 }}>
            Buat
          </button>
        </form>
      </section>

      <section>
        <h2>Daftar Sessions</h2>
        {loading ? <div>Memuat...</div> : null}
        {!loading && sessions.length === 0 ? <div>Belum ada session.</div> : null}

        <div style={{ display: 'grid', gap: 12 }}>
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onSave={onSaveSession} onDelete={onDeleteSession} />
          ))}
        </div>
      </section>
    </main>
  );
}

function SessionCard({ session, onSave, onDelete }) {
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(!!session.autoReplyEnabled);
  const [autoReplyMode, setAutoReplyMode] = useState(session.autoReplyMode || 'static');
  const [cluster, setCluster] = useState(session.cluster || 'old');
  const [scriptLineParity, setScriptLineParity] = useState(session.scriptLineParity || 'odd');
  const [autoReplyText, setAutoReplyText] = useState(session.autoReplyText || '');
  const [autoReplyScriptText, setAutoReplyScriptText] = useState(session.autoReplyScriptText || '');

  return (
    <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600 }}>{session.wahaSession}</div>
          <div style={{ color: '#666', fontSize: 12 }}>id: {session.id}</div>
        </div>

        <button onClick={() => onDelete(session.id)} style={{ padding: 8 }}>
          Hapus
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 10, maxWidth: 520 }}>
        <label>
          Cluster nomor
          <select
            value={cluster}
            onChange={(e) => setCluster(e.target.value)}
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          >
            <option value="old">old</option>
            <option value="new">new</option>
          </select>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={autoReplyEnabled}
            onChange={(e) => setAutoReplyEnabled(e.target.checked)}
          />
          Auto-reply aktif
        </label>

        <label>
          Mode auto-reply
          <select
            value={autoReplyMode}
            onChange={(e) => setAutoReplyMode(e.target.value)}
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          >
            <option value="script">Script (multi-season)</option>
            <option value="static">Static (1 teks)</option>
          </select>
        </label>

        {autoReplyMode === 'script' ? (
          <label>
            Baris yang dikirim (parity)
            <select
              value={scriptLineParity}
              onChange={(e) => setScriptLineParity(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
            >
              <option value="odd">odd (1,3,5...)</option>
              <option value="even">even (2,4,6...)</option>
              <option value="all">all (semua baris)</option>
            </select>
          </label>
        ) : null}

        {autoReplyMode === 'static' ? (
          <label>
            Teks Auto-reply (static)
            <textarea
              value={autoReplyText}
              onChange={(e) => setAutoReplyText(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 4, minHeight: 80 }}
            />
          </label>
        ) : (
          <label>
            Script multi-season
            <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
              Pisahkan antar season pakai 1 baris kosong. Tiap baris akan dikirim berurutan.
            </div>
            <textarea
              value={autoReplyScriptText}
              onChange={(e) => setAutoReplyScriptText(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 8, minHeight: 160 }}
            />
          </label>
        )}

        <button
          onClick={() =>
            onSave(session.id, {
              cluster,
              autoReplyEnabled,
              autoReplyMode,
              scriptLineParity,
              autoReplyText,
              autoReplyScriptText,
            })
          }
          style={{ padding: 10, width: 120 }}
        >
          Simpan
        </button>
      </div>
    </div>
  );
}
