'use client';

const W = 240;
const H = 48;

/**
 * Minimal SVG sparkline. `invert` draws lower values higher (for rankings).
 * Gaps (null) break the line.
 */
export function Sparkline({
  values,
  color = '#3b82f6',
  invert = false,
  area = true,
  className = '',
}: {
  values: (number | null)[];
  color?: string;
  invert?: boolean;
  area?: boolean;
  className?: string;
}) {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length < 2) {
    return <div className={`flex h-12 items-center text-xs text-zinc-400 ${className}`}>Not enough history</div>;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max > min ? max - min : 1;
  const n = values.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => {
    const t = (v - min) / span;
    const norm = invert ? t : 1 - t;
    return 4 + norm * (H - 8);
  };

  const segments: string[] = [];
  let current = '';
  let firstX = Number.NaN;
  let lastX = Number.NaN;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      current += `${current ? ' L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      if (Number.isNaN(firstX)) firstX = x(i);
      lastX = x(i);
    } else if (current) {
      segments.push(current);
      current = '';
    }
  }
  if (current) segments.push(current);

  const areaPath =
    area && segments.length === 1 && !Number.isNaN(firstX) && !Number.isNaN(lastX)
      ? `${segments[0]} L${lastX.toFixed(1)},${H} L${firstX.toFixed(1)},${H} Z`
      : null;
  const gid = `spark-${color.replace('#', '')}-${invert ? 'i' : 'n'}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`h-12 w-full ${className}`} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}
