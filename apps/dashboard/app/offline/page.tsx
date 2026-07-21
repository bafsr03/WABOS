export const metadata = { title: 'Sin conexión — WABOS' };

export default function OfflinePage() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-bg p-8 text-center text-fg">
      <div>
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-lg font-bold text-white">W</div>
        <h1 className="text-lg font-semibold">Sin conexión</h1>
        <p className="mt-1 text-sm text-muted">Revisa tu internet. WABOS se reconecta automáticamente.</p>
      </div>
    </div>
  );
}
