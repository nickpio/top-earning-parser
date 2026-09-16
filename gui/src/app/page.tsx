import Link from 'next/link';

import { ConstituentsTable } from '@/components/ConstituentsTable';
import { Header } from '@/components/Header';
import { IndexChart } from '@/components/IndexChart';
import { Methodology } from '@/components/Methodology';
import { StatCards } from '@/components/StatCards';
import { loadSnapshot } from '@/lib/data';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const DEFAULT_ROBUX_TO_USD = 0.7 * 0.0038;

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const snapshot = await loadSnapshot(date);

  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">No index data found</h1>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Run <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">python run_index_engine.py --replay-all</code>{' '}
            in the repository root to generate <code className="font-mono text-xs">index_data/exports</code>, or point{' '}
            <code className="font-mono text-xs">RTE_DATA_DIR</code> at an exports directory.
          </p>
        </div>
      </div>
    );
  }

  const robuxToUsd = snapshot.meta?.robux_to_usd ?? DEFAULT_ROBUX_TO_USD;
  const isLatest = snapshot.date === snapshot.availableDates[0];

  return (
    <div className="min-h-screen">
      <Header dates={snapshot.availableDates} current={snapshot.date} meta={snapshot.meta} />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {!isLatest && (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Viewing the historical rebalance of <strong>{fmtDate(snapshot.date)}</strong>. The latest data is from{' '}
            <Link href="/" className="font-medium underline underline-offset-2">
              {fmtDate(snapshot.availableDates[0])}
            </Link>
            .
          </div>
        )}

        <StatCards indexLevel={snapshot.indexLevel} games={snapshot.games} meta={snapshot.meta} />

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Index performance</h2>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                Chain-linked, revenue-weighted level of the basket&apos;s trailing 7-day estimated daily revenue. Base 1,000.
              </p>
            </div>
          </div>
          <IndexChart data={snapshot.indexLevel} />
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Constituents</h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              Ranked by trailing 7-day estimated daily revenue. Select a row to open its detail panel.
            </p>
          </div>
          <ConstituentsTable games={snapshot.games} date={snapshot.date} robuxToUsd={robuxToUsd} />
        </section>

        <Methodology meta={snapshot.meta} />
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-zinc-500 sm:px-6 lg:px-8 dark:text-zinc-500">
        <p>
          Estimates are model outputs derived from public Roblox data (concurrent players, visits, votes and the Top-Earning
          chart); they are not reported revenue. USD figures assume the 70% creator share and the DevEx rate. Not affiliated
          with Roblox Corporation.
          {snapshot.meta && (
            <>
              {' '}
              Model v{snapshot.meta.model_version}, generated {new Date(snapshot.meta.generated_at).toUTCString()}.
            </>
          )}
        </p>
      </footer>
    </div>
  );
}
