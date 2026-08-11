'use client';

import { Badge } from '@/components/ui/primitives';

// kind = what happened, origin = who did it. Keeping the two labels distinct is
// the whole point of the inventory/IA split: the shopkeeper can see at a glance
// whether a movement was his doing, the register's, or the AI's.

export type StockKind = 'entry' | 'sale' | 'void' | 'adjustment' | 'count' | 'import';
export type StockOrigin = 'dashboard' | 'pos' | 'ai' | 'import' | 'system';

export const KIND_LABEL: Record<StockKind, string> = {
  entry: 'Entrada',
  sale: 'Venta',
  void: 'Anulación',
  adjustment: 'Ajuste',
  count: 'Conteo',
  import: 'Importación',
};

export const ORIGIN_LABEL: Record<StockOrigin, string> = {
  dashboard: 'Yo',
  pos: 'Punto de venta',
  ai: 'Empleado IA',
  import: 'Importación',
  system: 'Sistema',
};

const KIND_TONE: Record<StockKind, 'success' | 'danger' | 'warn' | 'info' | 'neutral'> = {
  entry: 'success',
  sale: 'info',
  void: 'warn',
  adjustment: 'warn',
  count: 'neutral',
  import: 'neutral',
};

export function KindBadge({ kind }: { kind: StockKind }) {
  return <Badge tone={KIND_TONE[kind] ?? 'neutral'}>{KIND_LABEL[kind] ?? kind}</Badge>;
}

export function OriginBadge({ origin }: { origin: StockOrigin }) {
  return <Badge tone={origin === 'ai' ? 'accent' : 'neutral'}>{ORIGIN_LABEL[origin] ?? origin}</Badge>;
}
