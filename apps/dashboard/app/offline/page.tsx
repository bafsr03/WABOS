export const metadata = { title: 'Sin conexión — WABOS' };

export default function OfflinePage() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-bg p-8 text-center text-fg">
      <div>
        <img src="/logo.png" alt="WABOS" width={56} height={56} className="mx-auto mb-4 h-14 w-14 rounded-2xl object-cover" />
        <h1 className="text-lg font-semibold">Sin conexión</h1>
        <p className="mt-1 text-sm text-muted">Revisa tu internet. WABOS se reconecta automáticamente.</p>
      </div>
    </div>
  );
}
