'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { dateToMs, fmtCompact, fmtDate, fmtPct, fmtRobux, fmtUsd } from '@/lib/format';
import type { IndexPoint } from '@/lib/types';

type Range = '1M' | '3M' | '6M' | '1Y' | 'ALL';
type Metric = 'level' | 'basket';

const RANGE_DAYS: Record<Exclude<Range, 'ALL'>, number> = { '1M': 30, '3M': 91, '6M': 182, '1Y': 365 };
const DAY_MS = 86_400_000;
const HEIGHT = 300;
const MARGIN = { top: 16, right: 16, bottom: 30, left: 60 };

const UP = '#10b981';
const DOWN = '#f43f5e';

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(count - 1, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function IndexChart({ data }: { data: IndexPoint[] }) {
  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const spanDays = sorted.length > 1 ? (dateToMs(sorted[sorted.length - 1].date) - dateToMs(sorted[0].date)) / DAY_MS : 0;

  const [range, setRange] = useState<Range>(spanDays > 95 ? '3M' : 'ALL');
  const [metric, setMetric] = useState<Metric>('level');
  const [hover, setHover] = useState<number | null>(null);
  const [containerRef, width] = useContainerWidth<HTMLDivElement>();

  const visible = useMemo(() => {
    if (range === 'ALL' || sorted.length === 0) return sorted;
    const lastMs = dateToMs(sorted[sorted.length - 1].date);
    const cut = lastMs - RANGE_DAYS[range] * DAY_MS;
    const v = sorted.filter((p) => dateToMs(p.date) >= cut);
    return v.length >= 2 ? v : sorted;
  }, [sorted, range]);

  const value = (p: IndexPoint) => (metric === 'level' ? p.index_level : p.basket_edr);
  const fmtValue = (v: number) => (metric === 'level' ? v.toFixed(2) : fmtRobux(v, 2));
  const fmtTick = (v: number) => (metric === 'level' ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : fmtCompact(v, 1));

  if (sorted.length === 0) {
    return (
      <div className="card-muted flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Index inception pending</span>
        <span className="max-w-sm">
          The level starts once constituents have at least three observations inside the 7-day smoothing window, so a
          single early snapshot cannot define the base.
        </span>
      </div>
    );
  }

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const times = visible.map((p) => dateToMs(p.date));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const values = visible.map(value);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const pad = vMax > vMin ? (vMax - vMin) * 0.1 : Math.abs(vMax) * 0.05 || 1;
  const ticks = niceTicks(vMin - pad, vMax + pad, 5);
  const y0 = Math.min(ticks[0], vMin - pad);
  const y1 = Math.max(ticks[ticks.length - 1], vMax + pad);

  const x = (t: number) => MARGIN.left + (t1 > t0 ? ((t - t0) / (t1 - t0)) * innerW : innerW / 2);
  const y = (v: number) => MARGIN.top + (1 - (v - y0) / (y1 - y0)) * innerH;

  const points = visible.map((p, i) => [x(times[i]), y(values[i])] as const);
  const linePath = points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${(MARGIN.top + innerH).toFixed(1)} L${points[0][0].toFixed(1)},${(MARGIN.top + innerH).toFixed(1)} Z`;

  const first = values[0];
  const last = values[values.length - 1];
  const change = first ? last / first - 1 : 0;
  const color = change >= 0 ? UP : DOWN;
  const gradientId = `rte-area-${metric}`;

  const xTickCount = Math.max(2, Math.min(6, Math.floor(innerW / 120)));
  const xTickIdx = Array.from(new Set(Array.from({ length: xTickCount }, (_, i) => Math.round((i * (visible.length - 1)) / (xTickCount - 1)))));

  const hovered = hover !== null ? visible[hover] : null;
  const hoverPrev = hover !== null && hover > 0 ? visible[hover - 1] : null;

  const onMove = (clientX: number, target: SVGRectElement) => {
    const rect = target.getBoundingClientRect();
    const px = clientX - rect.left + MARGIN.left;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i][0] - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHover(best);
  };

  const ranges: Range[] = (Object.keys(RANGE_DAYS) as Exclude<Range, 'ALL'>[]).filter((r) => RANGE_DAYS[r] < spanDays);
  ranges.push('ALL');

  const high = Math.max(...values);
  const low = Math.min(...values);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="num text-3xl font-semibold tracking-tight">{fmtValue(last)}</span>
          <span className={`num text-sm font-medium ${change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {change >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(change), 2)}
            <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">
              since {fmtDate(visible[0].date, false)}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Metric" className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs font-medium dark:border-zinc-800 dark:bg-zinc-800/60">
            {(
              [
                ['level', 'Index level'],
                ['basket', 'Basket EDR'],
              ] as [Metric, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={metric === m}
                onClick={() => setMetric(m)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  metric === m ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tablist" aria-label="Range" className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs font-medium dark:border-zinc-800 dark:bg-zinc-800/60">
            {ranges.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  range === r ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {r === 'ALL' ? 'All' : r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full select-none" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} className="block overflow-visible" role="img" aria-label={`${metric === 'level' ? 'Index level' : 'Basket EDR'} over time`}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {ticks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
                <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-400 text-[11px] tabular-nums dark:fill-zinc-500">
                  {fmtTick(t)}
                </text>
              </g>
            ))}

            {metric === 'level' && 1000 >= y0 && 1000 <= y1 && (
              <g>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(1000)} y2={y(1000)} className="stroke-zinc-400/70 dark:stroke-zinc-600" strokeDasharray="4 4" strokeWidth="1" />
                <text x={width - MARGIN.right} y={y(1000) - 4} textAnchor="end" className="fill-zinc-400 text-[10px] dark:fill-zinc-500">
                  base 1,000
                </text>
              </g>
            )}

            {xTickIdx.map((i) => (
              <text key={i} x={points[i][0]} y={HEIGHT - 8} textAnchor={i === 0 ? 'start' : i === visible.length - 1 ? 'end' : 'middle'} className="fill-zinc-400 text-[11px] dark:fill-zinc-500">
                {fmtDate(visible[i].date, spanDays > 300)}
              </text>
            ))}

            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {visible.length <= 60 &&
              points.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={hover === i ? 0 : 2.5} fill={color} />)}

            {hovered && hover !== null && (
              <g>
                <line x1={points[hover][0]} x2={points[hover][0]} y1={MARGIN.top} y2={MARGIN.top + innerH} className="stroke-zinc-400 dark:stroke-zinc-500" strokeDasharray="3 3" />
                <circle cx={points[hover][0]} cy={points[hover][1]} r="5" fill={color} className="stroke-white dark:stroke-zinc-900" strokeWidth="2" />
              </g>
            )}

            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onMouseMove={(e) => onMove(e.clientX, e.currentTarget)}
              onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget)}
              onTouchStart={(e) => onMove(e.touches[0].clientX, e.currentTarget)}
              onMouseLeave={() => setHover(null)}
            />
          </svg>
        )}

        {hovered && hover !== null && width > 0 && (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-xl border border-zinc-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95"
            style={{
              left: Math.min(Math.max(points[hover][0] - 104, 0), width - 208),
              top: Math.max(points[hover][1] - 132, 0),
            }}
          >
            <div className="mb-1.5 font-medium">{fmtDate(hovered.date)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-zinc-500">Index</dt>
              <dd className="num text-right font-medium">{hovered.index_level.toFixed(2)}</dd>
              <dt className="text-zinc-500">Change</dt>
              <dd className={`num text-right font-medium ${hovered.daily_return >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {hoverPrev ? fmtPct(hovered.daily_return, 2, true) : '—'}
              </dd>
              <dt className="text-zinc-500">Basket EDR</dt>
              <dd className="num text-right">{fmtRobux(hovered.basket_edr, 1)}</dd>
              <dt className="text-zinc-500">≈ USD/day</dt>
              <dd className="num text-right">{fmtUsd(hovered.basket_edr_usd, 2)}</dd>
              <dt className="text-zinc-500">Coverage</dt>
              <dd className="num text-right">{fmtPct(hovered.coverage, 1)}</dd>
            </dl>
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-200 pt-4 text-sm sm:grid-cols-4 dark:border-zinc-800">
        <div>
          <dt className="label">Start</dt>
          <dd className="num mt-0.5 font-medium">{fmtValue(first)}</dd>
        </div>
        <div>
          <dt className="label">High</dt>
          <dd className="num mt-0.5 font-medium">{fmtValue(high)}</dd>
        </div>
        <div>
          <dt className="label">Low</dt>
          <dd className="num mt-0.5 font-medium">{fmtValue(low)}</dd>
        </div>
        <div>
          <dt className="label">Observations</dt>
          <dd className="num mt-0.5 font-medium">
            {visible.length} <span className="text-xs font-normal text-zinc-500">of {sorted.length}</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
