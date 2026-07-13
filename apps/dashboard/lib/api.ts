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
