'use client';

import { useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { getToken } from '../../../lib/auth';

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20 ${props.className || ''}`}
    />
  );
}

export default function WahaAuthPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [sessionName, setSessionName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [qr, setQr] = useState(null);
  const [pairingCode, setPairingCode] = useState('');

  async function startSession() {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/waha/sessions/${encodeURIComponent(sessionName)}/start`, {
        token: getToken(),
        method: 'POST',
      });
    } catch (e) {
      setError(e?.message || 'Gagal start session');
    } finally {
      setBusy(false);
    }
  }

  async function getQr() {
    setBusy(true);
    setError('');
    setQr(null);
    try {
      const data = await apiFetch(`/waha/sessions/${encodeURIComponent(sessionName)}/qr`, {
        token: getToken(),
        method: 'GET',
      });
      setQr(data);
    } catch (e) {
      setError(e?.message || 'Gagal ambil QR');
    } finally {
      setBusy(false);
    }
  }

  async function requestPairingCode() {
    setBusy(true);
    setError('');
    setPairingCode('');
    try {
      const data = await apiFetch(`/waha/sessions/${encodeURIComponent(sessionName)}/pairing-code`, {
        token: getToken(),
        method: 'POST',
        body: { phoneNumber },
      });
      setPairingCode(data.code || '');
    } catch (e) {
      setError(e?.message || 'Gagal request pairing code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5">
        <h1 className="text-xl font-semibold">WhatsApp Authentication</h1>
        <p className="mt-1 text-sm text-gray-600">
          Login nomor WhatsApp via QR atau pairing code.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-base font-semibold">Start + QR</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Nama session</label>
              <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="contoh: old-1" />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy || !sessionName.trim()}
                onClick={startSession}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              >
                Start Session
              </button>
              <button
                disabled={busy || !sessionName.trim()}
                onClick={getQr}
                className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Get QR
              </button>
            </div>

            {qr?.data && qr?.mimetype ? (
              <div className="rounded-xl border bg-gray-50 p-4">
                <div className="text-xs text-gray-600">Scan QR ini di WhatsApp (Linked devices).</div>
                <img
                  alt="QR Code"
                  src={`data:${qr.mimetype};base64,${qr.data}`}
                  className="mt-3 h-[260px] w-[260px] rounded-lg border bg-white"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-base font-semibold">Pairing Code (fallback)</h2>
          <p className="mt-1 text-sm text-gray-600">Gunakan jika QR gagal.</p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Nama session</label>
              <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="contoh: old-1" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Phone number (tanpa +)</label>
              <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="contoh: 62812xxxxxxx" />
            </div>

            <button
              disabled={busy || !sessionName.trim() || !phoneNumber.trim()}
              onClick={requestPairingCode}
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              Request Pairing Code
            </button>

            {pairingCode ? (
              <div className="rounded-xl border bg-gray-50 px-4 py-3">
                <div className="text-xs text-gray-600">Pairing code</div>
                <div className="mt-1 text-2xl font-semibold tracking-wider text-gray-900">{pairingCode}</div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
