'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { fmtDate } from '@/lib/format';

export function DateSelector({ dates, current }: { dates: string[]; current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const latest = dates[0];

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-zinc-500 sm:inline dark:text-zinc-400">Rebalance</span>
      <span className="relative">
        <select
          aria-label="Rebalance date"
          value={current}
          disabled={pending}
          onChange={(e) => {
            const d = e.target.value;
            startTransition(() => router.push(d === latest ? '/' : `/?date=${d}`));
          }}
          className="appearance-none rounded-lg border border-zinc-300 bg-white py-1.5 pl-3 pr-8 text-sm font-medium shadow-sm transition-colors hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          {dates.map((d) => (
            <option key={d} value={d}>
              {fmtDate(d)}
              {d === latest ? ' (latest)' : ''}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 ${pending ? 'animate-pulse' : ''}`}
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </span>
    </label>
  );
}
