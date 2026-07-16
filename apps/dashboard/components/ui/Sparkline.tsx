'use client';

// Dependency-free SVG charts — an area sparkline and mini bars.

export function Sparkline({ data, className, stroke = 'var(--brand)' }: { data: number[]; className?: string; stroke?: string }) {
  const w = 100, h = 32;
  if (data.length < 2) return <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / span) * (h - 4) - 2] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const id = `sg-${Math.round(max * 100)}-${data.length}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MiniBars({ data, className, color = 'var(--brand)' }: { data: number[]; className?: string; color?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className={`flex items-end gap-1 ${className ?? ''}`}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm transition-all" style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: color, opacity: 0.35 + (v / max) * 0.65 }} />
      ))}
    </div>
  );
}
