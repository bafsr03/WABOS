'use client';

import LoginForm from '@/components/auth/LoginForm';

// Kept as a route for back-compat / deep links; the same form also renders at /
// (root) for unauthenticated visitors so the PWA is installable at the root path.
export default function LoginPage() {
  return <LoginForm />;
}
