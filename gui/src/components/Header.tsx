import type { Meta } from '@/lib/types';

import { DateSelector } from './DateSelector';

export function Header({ dates, current, meta }: { dates: string[]; current: string; meta: Meta | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-zinc-50/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l5-6 4 3 5-7 4 4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">
              RTE100
              <span className="ml-2 hidden rounded-md border border-zinc-200 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:inline dark:border-zinc-700 dark:text-zinc-400">
                Model v{meta?.model_version ?? '2.0'}
              </span>
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Roblox Top-Earning 100 · Estimated Daily Revenue Index</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <DateSelector dates={dates} current={current} />
        </div>
      </div>
    </header>
  );
}
