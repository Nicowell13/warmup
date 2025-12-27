const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function apiFetch(path, { token, method, body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
