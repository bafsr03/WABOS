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
    if (typeof window !== 'undefined') window.location.href = '/login';
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
