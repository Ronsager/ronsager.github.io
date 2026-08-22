/** Schmaler Fetch-Wrapper mit Token-Verwaltung. */

const TOKEN_KEY = 'stc_token';

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(v) { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); },
};

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload || {};
  }
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }

  if (!res.ok) {
    if (res.status === 401) {
      auth.token = null;
      window.dispatchEvent(new CustomEvent('stc:unauthorized'));
    }
    throw new ApiError(data?.error || `Serverfehler (${res.status})`, res.status, data);
  }
  return data;
}

export const api = {
  get:   (path) => request('GET', path),
  post:  (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del:   (path, body) => request('DELETE', path, body ?? {}),
};
