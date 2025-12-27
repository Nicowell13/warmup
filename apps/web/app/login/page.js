'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '../../lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Login gagal');
      }

      setToken(data.token);
      router.push('/sessions');
    } catch (err) {
      setError(err?.message || 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto flex min-h-dvh max-w-6xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-6">
            <div className="mb-2 h-10 w-10 rounded-xl bg-gray-900" />
            <h1 className="text-2xl font-semibold">Login</h1>
            <p className="mt-1 text-sm text-gray-600">
              Gunakan <span className="font-mono">ADMIN_USERNAME</span> dan <span className="font-mono">ADMIN_PASSWORD</span> di API.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20"
                autoComplete="current-password"
              />
            </div>

            {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
