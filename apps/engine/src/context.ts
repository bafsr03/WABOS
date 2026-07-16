import { AsyncLocalStorage } from 'node:async_hooks';

// Request/task-scoped tenant context. Every data helper reads currentBusinessId()
// and scopes its query, so business isolation lives in one place instead of being
// threaded through every function signature. It defaults to business 1 — the
// single tenant that exists today — so any code path that hasn't yet entered a
// context (module-load reads, single-tenant production) stays correct unchanged.
//
// Set it at the three entry points that know which business they're serving:
//   - the API auth hook (from the authenticated session/token),
//   - the WhatsApp inbound handler (from the socket's business),
//   - each job handler (from job.business_id).

export const DEFAULT_BUSINESS_ID = 1;

interface Store {
  businessId: number;
}

const als = new AsyncLocalStorage<Store>();

export function runWithBusiness<T>(businessId: number, fn: () => T): T {
  return als.run({ businessId }, fn);
}

// Bind the tenant for the remainder of the current async execution (and its
// descendants) without a wrapping callback. Used from a Fastify onRequest hook,
// where the request handler runs after the hook returns but stays in the same
// async context.
export function enterBusiness(businessId: number): void {
  als.enterWith({ businessId });
}

export function currentBusinessId(): number {
  return als.getStore()?.businessId ?? DEFAULT_BUSINESS_ID;
}
