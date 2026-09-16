'use client';

import { useMemo, useState } from 'react';

import { fmtCompact, fmtMultiplier, fmtPct, fmtRobux, fmtUsd, isNum, robloxUrl } from '@/lib/format';
import type { Constituent } from '@/lib/types';

import { GameDetails } from './GameDetails';

type SortKey = 'rank' | 'name' | 'weight' | 'edr_7d_mean' | 'edr_raw' | 'edr_mom' | 'avg_ccu' | 'top_earning_rank';

interface Column {
  key: SortKey;
  label: string;
  hint: string;
  align: 'left' | 'right';
  className?: string;
}

const COLUMNS: Column[] = [
  { key: 'rank', label: '#', hint: 'Index rank by trailing 7-day estimated daily revenue, with change since the previous rebalance', align: 'left' },
  { key: 'name', label: 'Experience', hint: 'Experience and creator', align: 'left' },
  { key: 'weight', label: 'Weight', hint: 'Share of the index basket, proportional to 7-day EDR and capped at 10%', align: 'right' },
  { key: 'edr_7d_mean', label: 'EDR · 7d avg', hint: 'Estimated daily revenue, trailing 7-day mean, in Robux (USD developer earnings below)', align: 'right' },
  { key: 'edr_raw', label: 'EDR · latest', hint: 'Estimated daily revenue from the latest snapshot', align: 'right', className: 'hidden lg:table-cell' },
  { key: 'edr_mom', label: 'Momentum', hint: 'Ratio of the 7-day to the 30-day exponential moving average of EDR (>1 = accelerating)', align: 'right', className: 'hidden md:table-cell' },
  { key: 'avg_ccu', label: 'Players', hint: 'Concurrent players at the latest snapshot', align: 'right', className: 'hidden sm:table-cell' },
  { key: 'top_earning_rank', label: 'Roblox chart', hint: "Position in Roblox's own Top-Earning chart at the latest snapshot", align: 'right', className: 'hidden md:table-cell' },
];

const DEFAULT_ROWS = 25;

function RankChange({ g }: { g: Constituent }) {
  if (g.is_new) {
    return <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">new</span>;
  }
  if (!isNum(g.rank_change) || g.rank_change === 0) return <span className="text-xs text-zinc-400">–</span>;
  const up = g.rank_change > 0;
  return (
    <span className={`num text-xs font-medium ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(g.rank_change)}
    </span>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <svg viewBox="0 0 12 12" className={`ml-1 inline h-3 w-3 ${active ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-300 dark:text-zinc-600'}`} fill="currentColor" aria-hidden>
      {active && dir === 'asc' ? <path d="M6 2l4 5H2z" /> : active ? <path d="M6 10L2 5h8z" /> : <path d="M6 1l3 3.5H3zM6 11L3 7.5h6z" />}
    </svg>
  );
}

export function ConstituentsTable({ games, date, robuxToUsd }: { games: Constituent[]; date: string; robuxToUsd: number }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const maxWeight = useMemo(() => Math.max(...games.map((g) => g.weight), 0), [games]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? games.filter((g) => g.name.toLowerCase().includes(q) || (g.developer ?? '').toLowerCase().includes(q) || String(g.universeId) === q)
      : games;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' || typeof bv === 'string') return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
      const an = isNum(av) ? av : Number.POSITIVE_INFINITY;
      const bn = isNum(bv) ? bv : Number.POSITIVE_INFINITY;
      if (an === bn) return a.rank - b.rank;
      return (an - bn) * dir;
    });
  }, [games, query, sortKey, sortDir]);

  const visibleRows = showAll || query ? rows : rows.slice(0, DEFAULT_ROWS);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' || key === 'name' || key === 'top_earning_rank' ? 'asc' : 'desc');
    }
  };

  const toggleRow = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full sm:w-80">
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.58 3.58a1 1 0 01-1.42 1.42l-3.58-3.58A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search experience, creator or universe ID"
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="num">
            {query ? `${rows.length} match${rows.length === 1 ? '' : 'es'}` : `Showing ${visibleRows.length} of ${games.length}`}
          </span>
          {expanded.size > 0 && (
            <button onClick={() => setExpanded(new Set())} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Collapse all
            </button>
          )}
        </div>
      </div>

      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs dark:border-zinc-800">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-2.5 font-medium text-zinc-500 first:pl-5 dark:text-zinc-400 sm:first:pl-6 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.className ?? ''}`}
                >
                  <button onClick={() => toggleSort(c.key)} title={c.hint} className="inline-flex items-center hover:text-zinc-900 dark:hover:text-zinc-100">
                    {c.label}
                    <SortIcon active={sortKey === c.key} dir={sortDir} />
                  </button>
                </th>
              ))}
              <th scope="col" className="w-10 pr-5 sm:pr-6">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {visibleRows.map((g) => {
              const open = expanded.has(g.universeId);
              return (
                <RowGroup key={g.universeId} g={g} open={open} onToggle={() => toggleRow(g.universeId)} maxWeight={maxWeight} date={date} robuxToUsd={robuxToUsd} />
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-5 py-10 text-center text-sm text-zinc-500">
                  No constituents match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!query && rows.length > DEFAULT_ROWS && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setShowAll((s) => !s)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            {showAll ? `Show top ${DEFAULT_ROWS}` : `Show all ${rows.length} constituents`}
          </button>
        </div>
      )}
    </div>
  );
}

function RowGroup({
  g,
  open,
  onToggle,
  maxWeight,
  date,
  robuxToUsd,
}: {
  g: Constituent;
  open: boolean;
  onToggle: () => void;
  maxWeight: number;
  date: string;
  robuxToUsd: number;
}) {
  const momentumTone = g.edr_mom >= 1.05 ? 'text-emerald-600 dark:text-emerald-400' : g.edr_mom <= 0.95 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-600 dark:text-zinc-300';
  return (
    <>
      <tr
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        aria-expanded={open}
        className={`cursor-pointer transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:bg-blue-50 dark:hover:bg-zinc-800/50 dark:focus-visible:bg-blue-500/10 ${open ? 'bg-zinc-50 dark:bg-zinc-800/40' : ''}`}
      >
        <td className="whitespace-nowrap py-3 pl-5 pr-3 sm:pl-6">
          <div className="flex items-center gap-2">
            <span className="num w-7 font-semibold">{g.rank}</span>
            <RankChange g={g} />
          </div>
        </td>
        <td className="max-w-[260px] px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium" title={g.name}>
                {g.name}
              </div>
              <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{g.developer ?? 'Unknown creator'}</div>
            </div>
            <a
              href={robloxUrl(g)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open on Roblox"
              className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                <path d="M11 3a1 1 0 100 2h2.59l-6.3 6.3a1 1 0 101.42 1.4L15 6.42V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
            </a>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100 sm:block dark:bg-zinc-800">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${maxWeight ? (g.weight / maxWeight) * 100 : 0}%` }} />
            </div>
            <span className="num w-14 font-medium">{fmtPct(g.weight, 2)}</span>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right">
          <div className="num font-semibold">{fmtRobux(g.edr_7d_mean, 1)}</div>
          <div className="num text-xs text-zinc-500 dark:text-zinc-400">≈ {fmtUsd(g.edr_7d_mean * robuxToUsd, 1)}</div>
        </td>
        <td className="num hidden whitespace-nowrap px-3 py-3 text-right text-zinc-600 lg:table-cell dark:text-zinc-300">{fmtRobux(g.edr_raw, 1)}</td>
        <td className={`num hidden whitespace-nowrap px-3 py-3 text-right font-medium md:table-cell ${momentumTone}`}>{fmtMultiplier(g.edr_mom)}</td>
        <td className="num hidden whitespace-nowrap px-3 py-3 text-right text-zinc-600 sm:table-cell dark:text-zinc-300">{fmtCompact(g.avg_ccu, 1)}</td>
        <td className="num hidden whitespace-nowrap px-3 py-3 text-right text-zinc-600 md:table-cell dark:text-zinc-300">
          {isNum(g.top_earning_rank) ? `#${g.top_earning_rank}` : '—'}
        </td>
        <td className="py-3 pl-2 pr-5 text-right sm:pr-6">
          <svg viewBox="0 0 20 20" className={`inline h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </td>
      </tr>
      {open && (
        <tr className="bg-zinc-50/70 dark:bg-zinc-900/60">
          <td colSpan={COLUMNS.length + 1} className="px-5 pb-5 pt-1 sm:px-6">
            <GameDetails key={`${g.universeId}-${date}`} game={g} date={date} robuxToUsd={robuxToUsd} />
          </td>
        </tr>
      )}
    </>
  );
}
