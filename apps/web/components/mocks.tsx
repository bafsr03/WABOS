import { Check, CheckCheck, ShieldCheck, Sparkles, Wallet, Clock, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ---------------- WhatsApp-style chat thread ---------------- */
function Bubble({ side, children, meta }: { side: 'in' | 'out'; children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className={cn('flex', side === 'out' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug shadow-sm',
          side === 'out'
            ? 'rounded-br-md bg-[#dcf8c6] text-[#0b1f14]'
            : 'rounded-bl-md bg-white text-fg',
        )}
      >
        {children}
        {meta && <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-black/40">{meta}</div>}
      </div>
    </div>
  );
}

export function ChatMock({ className }: { className?: string }) {
  return (
    <div className={cn('w-full max-w-sm overflow-hidden rounded-[26px] border border-border bg-surface shadow-[var(--shadow-lg)]', className)}>
      {/* phone header */}
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-sm font-semibold">MP</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Minimarket Perú</div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/70">
            <Sparkles size={11} /> Empleado IA activo
          </div>
        </div>
        <div className="ml-auto h-2 w-2 rounded-full bg-wa pulse-ring" />
      </div>

      {/* chat body */}
      <div className="space-y-2.5 bg-[#e6ddd4] px-3.5 py-4">
        <Bubble side="in">Hola, ¿tienen gaseosa de 3 litros? ¿a cuánto?</Bubble>
        <Bubble side="out" meta={<><span>9:41</span><CheckCheck size={13} className="text-[#4fc3f7]" /></>}>
          ¡Hola! 👋 Sí, tenemos Inca Kola 3L a <b>S/ 9.50</b>. ¿Te la aparto?
        </Bubble>
        <Bubble side="in">Sí, quiero 2. ¿Yape?</Bubble>
        <Bubble side="out" meta={<><span>9:41</span><CheckCheck size={13} className="text-[#4fc3f7]" /></>}>
          Claro 🙌 Son <b>S/ 19.00</b>. Yapea al 987 654 321 y mándame la captura.
        </Bubble>
        <Bubble side="in" meta={<><span>9:43</span><Check size={13} /></>}>
          <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-black/5 px-2 py-1.5">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-[#742284] text-[10px] font-bold text-white">Yape</div>
            <span className="text-[11px] font-medium">comprobante.jpg</span>
          </div>
          Listo, ahí está ✅
        </Bubble>
        <Bubble side="out" meta={<><span>9:43</span><CheckCheck size={13} className="text-[#4fc3f7]" /></>}>
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-[#0f9d63]" />
            <b>Pago verificado</b> — S/ 19.00. ¡Gracias por tu compra! 🎉
          </span>
        </Bubble>
      </div>
    </div>
  );
}

/* ---------------- Dashboard preview card ---------------- */
function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-subtle">{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      <div className="tabular mt-2 text-lg font-semibold text-fg">{value}</div>
    </div>
  );
}

export function DashboardMock({ className }: { className?: string }) {
  const bars = [40, 62, 48, 80, 56, 96, 72];
  return (
    <div className={cn('w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)]', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
        </div>
        <span className="ml-2 text-xs font-medium text-muted">WABOS · Resumen</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-wa/10 px-2 py-0.5 text-[10px] font-medium text-[#0f9d63]">
          <span className="h-1.5 w-1.5 rounded-full bg-wa" /> Conectado
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-3">
          <Kpi icon={<Wallet size={14} />} label="Hoy" value="S/ 842" tone="text-brand" />
          <Kpi icon={<Clock size={14} />} label="Pendientes" value="7" tone="text-warn" />
          <Kpi icon={<MessageCircle size={14} />} label="Sin leer" value="12" tone="text-brand" />
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-fg">Ingresos · 7 días</span>
            <span className="tabular text-xs text-muted">S/ 4,190</span>
          </div>
          <div className="flex h-24 items-end gap-2">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-brand/85" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
