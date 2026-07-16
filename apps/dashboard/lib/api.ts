export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:4000';

export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('wabos_token') ?? '';
}

export function setToken(token: string) {
  localStorage.setItem('wabos_token', token);
}

export function clearToken() {
  localStorage.removeItem('wabos_token');
}

async function authRequest(path: string, payload: object): Promise<void> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'No se pudo completar la solicitud');
  }
  const { token } = await res.json();
  setToken(token);
}

// Auth: exchange credentials for a JWT and store it (see authRequest).
export function login(email: string, password: string): Promise<void> {
  return authRequest('/api/auth/login', { email, password });
}

export function register(email: string, password: string, businessName: string): Promise<void> {
  return authRequest('/api/auth/register', { email, password, business_name: businessName });
}

// Exchange a Google ID token (from the Google Identity Services button) for a JWT.
export function googleLogin(credential: string): Promise<void> {
  return authRequest('/api/auth/google', { credential });
}

// Permanently delete the account + all its data, then clear the local session.
export async function deleteAccount(): Promise<void> {
  await api('/api/account', { method: 'DELETE' });
  clearToken();
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...options,
    headers: {
      // Only declare a JSON body when one is actually sent — a Content-Type of
      // application/json with an empty body makes Fastify reject the request.
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// Media is served behind the bearer token, so <img src> won't work directly:
// fetch the bytes with the auth header and hand back an object URL.
export async function fetchMediaUrl(mediaId: number): Promise<string> {
  const res = await fetch(`${ENGINE_URL}/api/media/${mediaId}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`Media request failed (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
