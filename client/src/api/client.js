/**
 * Thin REST client. The access token lives only in memory (never localStorage,
 * to limit XSS blast radius). The refresh token is an httpOnly cookie the JS
 * can't read. On a 401 we transparently rotate via /api/auth/refresh and retry.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '';


let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken() {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return false;
  const data = await res.json();
  accessToken = data.accessToken;
  return true;
}

export async function api(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && retry) {
    if (await refreshAccessToken()) {
      return api(path, { method, body, auth, retry: false });
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export { refreshAccessToken };
