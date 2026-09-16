'use client';

import { useEffect, useState } from 'react';

import { fmtAge, fmtCompact, fmtDate, fmtDuration, fmtInt, fmtMultiplier, fmtPct, fmtRobux, fmtUsd, isNum, robloxUrl } from '@/lib/format';
import type { Constituent, HistoryPoint } from '@/lib/types';

import { Sparkline } from './Sparkline';

type HistoryState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; series: HistoryPoint[] };

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="num mt-0.5 truncate text-sm font-medium">{value}</dd>
      {sub && <dd className="truncate text-xs text-zinc-500 dark:text-zinc-400">{sub}</dd>}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</div>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
    </li>
  );
}

function TrendBadge({ series, pick }: { series: HistoryPoint[]; pick: (p: HistoryPoint) => number | null }) {
  const vals = series.map(pick).filter((v): v is number => isNum(v));
  if (vals.length < 2 || !vals[0]) return null;
  const change = vals[vals.length - 1] / vals[0] - 1;
  const tone = change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <span className={`num text-xs font-medium ${tone}`}>
      {change >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(change), 1)}
    </span>
  );
}

export function GameDetails({ game: g, date, robuxToUsd }: { game: Constituent; date: string; robuxToUsd: number }) {
  const [history, setHistory] = useState<HistoryState>({ status: 'loading' });

  // The parent keys this component by universeId + date, so a mount is always a fresh load.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/games/${g.universeId}?date=${date}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`History unavailable (${r.status})`);
        const json = (await r.json()) as { series: HistoryPoint[] };
        setHistory({ status: 'ready', series: json.series });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setHistory({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load history' });
      });
    return () => controller.abort();
  }, [g.universeId, date]);

  const dauPerCcu = g.avg_ccu > 0 ? g.dau_est / g.avg_ccu : 20;
  const intensityTone =
    g.intensity >= 1.5 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
    : g.intensity <= 0.5 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
    : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200';
  const likeTotal = g.likes + g.dislikes;

  return (
    <div className="fade-in grid gap-4 lg:grid-cols-3">
      {/* 1. How the estimate is built */}
      <section className="card-muted p-4">
        <h3 className="mb-3 text-sm font-semibold">Revenue estimate</h3>
        <ol className="space-y-3">
          <Step n={1} title="Audience">
            <span className="num font-medium">{fmtCompact(g.avg_ccu, 1)}</span> concurrent players
            <span className="text-zinc-500 dark:text-zinc-400"> × {dauPerCcu.toFixed(0)} ≈ </span>
            <span className="num font-medium">{fmtCompact(g.dau_est, 1)}</span> daily active users
          </Step>
          <Step n={2} title="Monetization">
            <span className="num font-medium">R$ {g.arpdau.toFixed(2)}</span> per active user per day
            <span className={`num ml-2 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${intensityTone}`}>{fmtMultiplier(g.intensity, 2)} typical</span>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Inferred from Roblox Top-Earning position {isNum(g.top_earning_rank) ? `#${g.top_earning_rank}` : '(unknown)'} relative to audience,
              smoothed over recent snapshots.
            </p>
          </Step>
          <Step n={3} title="Estimated daily revenue">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Latest snapshot</div>
                <div className="num font-semibold">{fmtRobux(g.edr_raw, 2)}</div>
                <div className="num text-xs text-zinc-500 dark:text-zinc-400">≈ {fmtUsd(g.edr_raw * robuxToUsd, 2)} / day</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">7-day average</div>
                <div className="num font-semibold">{fmtRobux(g.edr_7d_mean, 2)}</div>
                <div className="num text-xs text-zinc-500 dark:text-zinc-400">
                  ≈ {fmtUsd(g.edr_7d_mean * robuxToUsd, 2)} / day · {fmtUsd(g.edr_7d_mean * robuxToUsd * 365, 1)} / yr
                </div>
              </div>
            </div>
          </Step>
        </ol>
      </section>

      {/* 2. Context metrics */}
      <section className="card-muted p-4">
        <h3 className="mb-3 text-sm font-semibold">Engagement &amp; catalogue</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-2">
          <Metric label="Roblox chart" value={isNum(g.top_earning_rank) ? `#${g.top_earning_rank}` : '—'} sub="Top-Earning position" />
          <Metric
            label="Index rank"
            value={isNum(g.prev_rank) ? `#${g.prev_rank} → #${g.rank}` : `#${g.rank}`}
            sub={g.is_new ? 'New entrant' : isNum(g.rank_change) && g.rank_change !== 0 ? `${g.rank_change > 0 ? 'Up' : 'Down'} ${Math.abs(g.rank_change)}` : 'Unchanged'}
          />
          <Metric label="Weight" value={fmtPct(g.weight, 2)} sub={g.weight >= 0.0999 ? 'At 10% cap' : 'of basket'} />
          <Metric label="Visits / day" value={fmtCompact(g.visits_per_day, 1)} sub={`${fmtCompact(g.visits, 1)} lifetime`} />
          <Metric label="Avg. session" value={fmtDuration(g.session_hours)} sub="CCU × 24h ÷ visits/day" />
          <Metric label="Like ratio" value={fmtPct(g.like_ratio, 1)} sub={likeTotal ? `${fmtCompact(g.likes, 1)} 👍 · ${fmtCompact(g.dislikes, 1)} 👎` : 'No votes'} />
          <Metric label="Favorites" value={fmtCompact(g.favorites, 1)} />
          <Metric
            label="Game passes"
            value={isNum(g.gamePassCount) ? fmtInt(g.gamePassCount) : '—'}
            sub={isNum(g.avgGamePassPrice) && g.avgGamePassPrice > 0 ? `avg R$ ${fmtInt(g.avgGamePassPrice)}` : 'no priced passes'}
          />
          <Metric label="Access" value={g.paidAccess ? `R$ ${fmtInt(g.paidAccessPrice)}` : 'Free to play'} sub={g.paidAccess ? 'Paid access' : undefined} />
          <Metric label="Age" value={fmtAge(g.ageDays)} />
          <Metric label="Momentum" value={fmtMultiplier(g.edr_mom)} sub="EMA 7d ÷ 30d" />
          <Metric label="Volatility" value={fmtPct(g.edr_14d_vol, 1)} sub={`14d · ${fmtInt(g.obs_7d)}/7 days observed`} />
        </dl>
      </section>

      {/* 3. History */}
      <section className="card-muted p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent history</h3>
          {history.status === 'ready' && history.series.length > 0 && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {fmtDate(history.series[0].d, false)} – {fmtDate(history.series[history.series.length - 1].d, false)}
            </span>
          )}
        </div>

        {history.status === 'loading' && (
          <div className="space-y-4" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <div className="skeleton mb-2 h-3 w-24" />
                <div className="skeleton h-12 w-full" />
              </div>
            ))}
          </div>
        )}
        {history.status === 'error' && <p className="text-sm text-rose-600 dark:text-rose-400">{history.message}</p>}
        {history.status === 'ready' && history.series.length < 2 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">This experience has only one snapshot in the history window.</p>
        )}
        {history.status === 'ready' && history.series.length >= 2 && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">EDR · 7d avg (R$)</span>
                <TrendBadge series={history.series} pick={(p) => p.edr7} />
              </div>
              <Sparkline values={history.series.map((p) => p.edr7)} color="#3b82f6" />
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Concurrent players</span>
                <TrendBadge series={history.series} pick={(p) => p.ccu} />
              </div>
              <Sparkline values={history.series.map((p) => p.ccu)} color="#8b5cf6" />
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Roblox chart position</span>
                <span className="num text-xs text-zinc-500 dark:text-zinc-400">
                  best #{Math.min(...history.series.map((p) => p.ter ?? Infinity))}
                </span>
              </div>
              <Sparkline values={history.series.map((p) => p.ter)} color="#f59e0b" invert area={false} />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
          <span className="num text-zinc-500 dark:text-zinc-400">Universe {g.universeId}</span>
          <a href={robloxUrl(g)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Open on Roblox ↗
          </a>
        </div>
      </section>
    </div>
  );
}
