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

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WAHA request failed: ${res.status} ${res.statusText} ${body}`);
  }

  return res.json().catch(() => ({}));
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
  return wahaRequestJson(`/api/sessions/${encodeURIComponent(session)}/start`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });
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
