// Empty by default → the app calls /api and /ws on its own origin, and Next
// proxies them to the engine (see next.config rewrites). This means a single
// public URL (port 3000) is enough for phone/tunnel testing. Set an absolute URL
// here only if you want the browser to hit the engine cross-origin directly.
export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? '';

export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('wabos_token') ?? '';
}

export function setToken(token: string) {
  localStorage.setItem('wabos_token', token);
}

export function clearToken() {
  localStorage.removeItem('wabos_token');
  localStorage.removeItem('wabos_business_id');
}

// The active workspace. Sent as X-Business-Id so the engine scopes every request
// (and the websocket) to it; unset means "the user's first business".
export function getBusinessId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('wabos_business_id') ?? '';
}

export function setBusinessId(id: number | string) {
  localStorage.setItem('wabos_business_id', String(id));
}

// Onboarding flags (tour completed, checklist hidden). Mirrored to a settings key
// so they persist server-side across devices, but read from localStorage first so
// the gate resolves before the first paint (no flash, no blocking fetch).
export function getFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`wabos_${key}`) === '1';
}

// Persist a flag locally (instant) and best-effort to settings (cross-device).
export function setFlag(key: string, on = true) {
  if (typeof window !== 'undefined') {
    if (on) localStorage.setItem(`wabos_${key}`, '1');
    else localStorage.removeItem(`wabos_${key}`);
  }
  api('/api/settings', { method: 'PUT', body: JSON.stringify({ [key]: on ? '1' : '' }) }).catch(() => {});
}

// String-valued, device-local preferences (theme). Deliberately NOT mirrored to
// /api/settings the way setFlag is: server settings are scoped per-BUSINESS via
// X-Business-Id, so a mirrored appearance choice would follow the workspace
// across users and devices. localStorage is the source of truth here.
export function getPref(key: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  try { return localStorage.getItem(`wabos_${key}`) ?? fallback; } catch { return fallback; }
}

export function setPref(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    if (value) localStorage.setItem(`wabos_${key}`, value);
    else localStorage.removeItem(`wabos_${key}`);
  } catch { /* private mode — preference just won't persist */ }
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

// Password recovery. `forgot` always resolves (the server never reveals whether
// the email exists); `reset` throws with a message on an invalid/expired token.
async function postJson(path: string, payload: object): Promise<void> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'No se pudo completar la solicitud');
  }
}

export function requestPasswordReset(email: string): Promise<void> {
  return postJson('/api/auth/forgot', { email });
}

export function resetPassword(token: string, password: string): Promise<void> {
  return postJson('/api/auth/reset', { token, password });
}

// Change password while logged in (verifies the current one server-side).
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return api('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

// Permanently delete the account + all its data, then clear the local session.
export async function deleteAccount(): Promise<void> {
  await api('/api/account', { method: 'DELETE' });
  clearToken();
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const businessId = getBusinessId();
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...options,
    headers: {
      // Only declare a JSON body when one is actually sent — a Content-Type of
      // application/json with an empty body makes Fastify reject the request.
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${getToken()}`,
      ...(businessId ? { 'X-Business-Id': businessId } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearToken();
    // Root shows the login form when logged out; staying on / keeps the iOS PWA in scope.
    if (typeof window !== 'undefined' && window.location.pathname !== '/') window.location.href = '/';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// ---- workspaces (multi-business) --------------------------------------------
export interface BusinessLite { id: number; name: string; plan_tier: string; role: string }

export function getMe(): Promise<{ user: { id: number; email: string } | null; businesses: BusinessLite[] }> {
  return api('/api/auth/me');
}

export function createBusiness(name: string): Promise<BusinessLite> {
  return api('/api/businesses', { method: 'POST', body: JSON.stringify({ name }) });
}

// ---- billing ----------------------------------------------------------------
export interface Status {
  status: string;
  planTier: string;
  billingAvailable: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: number | null;
  usage: { aiMessages: number; aiMessagesLimit: number | null; period: string };
  features: Record<string, boolean>;
}

export function getStatus(): Promise<Status> {
  return api('/api/status');
}

export type CheckoutTier = 'basico' | 'avanzado' | 'pro';
export type BillingInterval = 'month' | 'year';

export async function startCheckout(tier: CheckoutTier, interval: BillingInterval = 'month'): Promise<void> {
  const { url } = await api<{ url: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ tier, interval }) });
  window.location.href = url;
}

// Switch an existing subscription to another plan/interval (no redirect, prorated).
export function changePlan(tier: CheckoutTier, interval: BillingInterval = 'month'): Promise<{ ok: boolean }> {
  return api('/api/billing/change', { method: 'POST', body: JSON.stringify({ tier, interval }) });
}

export function cancelSubscription(): Promise<{ ok: boolean }> {
  return api('/api/billing/cancel', { method: 'POST' });
}

export function resumeSubscription(): Promise<{ ok: boolean }> {
  return api('/api/billing/resume', { method: 'POST' });
}

// Pull the subscription straight from the provider (webhook-independent).
export function syncBilling(): Promise<{ ok: boolean; found: boolean }> {
  return api('/api/billing/sync', { method: 'POST' });
}

export async function openBillingPortal(): Promise<void> {
  const { url } = await api<{ url: string }>('/api/billing/portal', { method: 'POST' });
  window.location.href = url;
}

// ---- agent testing ----------------------------------------------------------
export function startAgentTest(agentId: number): Promise<{ conversationId: number }> {
  return api(`/api/agents/${agentId}/test`, { method: 'POST' });
}

export function sendTestMessage(conversationId: number, text: string): Promise<{ ok: boolean }> {
  return api(`/api/conversations/${conversationId}/test-messages`, { method: 'POST', body: JSON.stringify({ text }) });
}

export function deleteTestConversation(conversationId: number): Promise<{ ok: boolean }> {
  return api(`/api/conversations/${conversationId}/test`, { method: 'DELETE' });
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

// ---- inventory import / export ----------------------------------------------
// Downloads under /api are behind the bearer token, so a plain <a href> won't
// authenticate. Fetch the bytes with the auth header, then trigger a save.
export async function apiDownload(path: string, filename: string): Promise<void> {
  const businessId = getBusinessId();
  const res = await fetch(`${ENGINE_URL}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}`, ...(businessId ? { 'X-Business-Id': businessId } : {}) },
  });
  if (!res.ok) throw new Error(`La descarga falló (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export interface ImportResult { created: number; updated: number; errors: { row: number; message: string }[] }

export function importProductsCsv(csv: string): Promise<ImportResult> {
  return api('/api/products/import', { method: 'POST', body: JSON.stringify({ csv }) });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = String(reader.result); resolve(s.slice(s.indexOf(',') + 1)); };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export async function uploadProductImage(productId: number, file: File): Promise<{ imagePath: string }> {
  const data = await fileToBase64(file);
  return api(`/api/products/${productId}/image`, {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, data }),
  });
}
