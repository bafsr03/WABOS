'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken, getToken } from '@/lib/api';
import { connectWs } from '@/lib/ws';

const NAV = [
  { href: '/connect', label: 'Conexión', icon: '📱' },
  { href: '/inbox', label: 'Inbox', icon: '💬' },
  { href: '/contacts', label: 'Contactos', icon: '👥' },
  { href: '/catalog', label: 'Catálogo', icon: '🛍' },
  { href: '/broadcasts', label: 'Campañas', icon: '📣' },
  { href: '/payments', label: 'Cobros', icon: '💳' },
  { href: '/settings', label: 'Ajustes', icon: '⚙️' },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [waStatus, setWaStatus] = useState<string>('...');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    return connectWs((event) => {
      if (event.type === 'wa.status') setWaStatus(event.status);
    });
  }, [router]);

  if (!ready) return null;

  const statusColor =
    waStatus === 'connected' ? 'bg-emerald-400' : waStatus === 'qr' ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 flex-col bg-slate-900 text-slate-200">
        <div className="px-5 py-6">
          <div className="text-xl font-bold tracking-tight text-white">
            WAB<span className="text-wa">OS</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span className={`h-2 w-2 rounded-full ${statusColor}`} />
            WhatsApp: {waStatus}
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                pathname.startsWith(item.href)
                  ? 'bg-wa-dark text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => { clearToken(); router.replace('/login'); }}
          className="m-3 rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800"
        >
          Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
