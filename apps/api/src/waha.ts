type WahaSendTextParams = {
  session: string;
  chatId: string;
  text: string;
};

const WAHA_BASE_URL = process.env.WAHA_BASE_URL || 'http://localhost:3001';
const WAHA_API_KEY = process.env.WAHA_API_KEY;

function wahaHeaders(extra?: Record<string, string>) {
  return {
    ...(WAHA_API_KEY ? { 'X-Api-Key': WAHA_API_KEY } : {}),
    ...extra,
  };
}

async function wahaRequestJson(path: string, init: RequestInit = {}) {
  const url = `${WAHA_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: wahaHeaders({
      ...(init.headers as any),
    }),
  });

  if (res.status === 204) {
    return {};
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error(
        `WAHA request failed: 401 Unauthorized (${path}). Pastikan API key WAHA sudah diset (env WAHA_API_KEY di service waha + api, header X-Api-Key). ${body}`
      );
    }
    if (res.status === 404) {
      throw new Error(
        `WAHA request failed: 404 Not Found (${path}). Ini biasanya terjadi jika session belum terbentuk/siap atau endpoint WAHA berbeda dari yang diharapkan. ${body}`
      );
    }
    throw new Error(`WAHA request failed: ${res.status} ${res.statusText} (${path}) ${body}`);
  }

  return res.json().catch(() => ({}));
}

async function wahaCreateSession(name: string, start = true) {
  // Docs: POST /api/sessions
  // By default, WAHA starts right after creation; we can also set { start: false }.
  return wahaRequestJson('/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name, start }),
  });
}

async function wahaDeprecatedStart(name: string) {
  // Docs (DEPRECATED): POST /api/sessions/start
  // Create (if not exists), Update (if existed), and Start.
  return wahaRequestJson('/api/sessions/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name }),
  });
}

async function wahaEnsureSessionExists(name: string) {
  // If WAHA session doesn't exist, POST /api/sessions/{name}/start will return 404.
  // Create it first (idempotent-ish: if exists, WAHA will likely respond with 409).
  try {
    await wahaCreateSession(name, true);
  } catch (e: any) {
    const msg = String(e?.message || '');
    const alreadyExists = msg.includes('409') || msg.toLowerCase().includes('already exists');
    if (!alreadyExists) throw e;
  }
}

export async function wahaSendText({ session, chatId, text }: WahaSendTextParams) {
  // NOTE: Some WAHA versions use other endpoints.
  // If your WAHA uses the newer per-session send API, we can switch this.
  return wahaRequestJson('/api/sendText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session, chatId, text }),
  });
}

// Docs: GET /api/{session}/auth/qr?format=image with Accept: application/json (base64)
export async function wahaGetQrBase64(session: string) {
  return wahaRequestJson(`/api/${encodeURIComponent(session)}/auth/qr?format=image`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
}

// Docs: POST /api/{session}/auth/request-code { phoneNumber }
export async function wahaRequestPairingCode(session: string, phoneNumber: string) {
  return wahaRequestJson(`/api/${encodeURIComponent(session)}/auth/request-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ phoneNumber }),
  });
}

// Docs: POST /api/sessions/{session}/start
export async function wahaStartSession(session: string) {
  // New WAHA API requires you to create session first.

  // Prefer granular API: create (no start) -> start
  try {
    await wahaCreateSession(session, false);
  } catch (e: any) {
    const msg = String(e?.message || '');
    const alreadyExists = msg.includes('409') || msg.toLowerCase().includes('already exists');
    if (!alreadyExists) throw e;
  }

  try {
    return await wahaRequestJson(`/api/sessions/${encodeURIComponent(session)}/start`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (e: any) {
    const msg = String(e?.message || '');
    const notFound = msg.includes('404') || msg.toLowerCase().includes('session not found');
    if (!notFound) throw e;

    // Fallback for builds that rely on older endpoint
    return wahaDeprecatedStart(session);
  }
}

// Docs: GET /api/sessions?all=true
export async function wahaListSessions(all = true) {
  const query = all ? '?all=true' : '';
  return wahaRequestJson(`/api/sessions${query}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
}

// Docs: DELETE /api/sessions/{session}
export async function wahaDeleteSession(session: string) {
  return wahaRequestJson(`/api/sessions/${encodeURIComponent(session)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });
}

// ===== Human-like Behavior Helpers =====

// Docs: POST /api/sendSeen - Mark messages as read (blue ticks)
export async function wahaSendSeen(session: string, chatId: string) {
  return wahaRequestJson('/api/sendSeen', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session, chatId }),
  });
}

// Docs: POST /api/startTyping - Show typing indicator
export async function wahaStartTyping(session: string, chatId: string) {
  return wahaRequestJson('/api/startTyping', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session, chatId }),
  });
}

// Docs: POST /api/stopTyping - Hide typing indicator
export async function wahaStopTyping(session: string, chatId: string) {
  return wahaRequestJson('/api/stopTyping', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session, chatId }),
  });
}

