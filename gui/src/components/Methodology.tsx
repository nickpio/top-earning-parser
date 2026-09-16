import type { Meta } from '@/lib/types';

function num(params: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const v = params?.[key];
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (Array.isArray(v)) return v.join(' – ');
  return fallback;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-zinc-200 py-3 first:border-t-0 dark:border-zinc-800">
      <summary className="flex items-center justify-between text-sm font-medium">
        {title}
        <svg viewBox="0 0 20 20" className="chevron h-4 w-4 text-zinc-400 transition-transform" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </summary>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{children}</div>
    </details>
  );
}

function rho(v: number | null | undefined): string {
  return typeof v === 'number' ? Math.abs(v).toFixed(2) : '—';
}

export function Methodology({ meta }: { meta: Meta | null }) {
  const edr = meta?.params?.EDRParams;
  const reb = meta?.params?.RebalanceParams;
  const idx = meta?.params?.IndexParams;
  const v = meta?.validation;

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Methodology</h2>
      <p className="mt-0.5 mb-2 text-sm text-zinc-500 dark:text-zinc-400">How the estimates and the index are produced. All parameters are published with each rebalance.</p>

      <Section title="Estimated Daily Revenue (EDR)">
        <p>
          For every experience and every daily snapshot:{' '}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">EDR = DAU × base ARPDAU × monetization intensity</code>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Audience.</strong> Daily active users are scaled from concurrent players (× {num(edr, 'dau_per_ccu', '20')}), consistent with
            platform-wide DAU-to-average-CCU ratios and ~2 experiences per player per day.
          </li>
          <li>
            <strong>Base ARPDAU.</strong> R$ {num(edr, 'base_arpdau_robux', '6')} of gross in-experience spend per active user per day, which anchors
            the total of the tracked universe to Roblox&apos;s published developer-earnings aggregates.
          </li>
          <li>
            <strong>Monetization intensity.</strong> Concurrent players alone explain only part of the earnings ordering (rank correlation ≈{' '}
            {rho(v?.spearman_ccu_only)}), because per-user monetization differs by more than an order of magnitude between experiences. The
            model therefore reads each experience&apos;s position in Roblox&apos;s own Top-Earning chart, assumes revenue falls off with position as
            rank<sup>−{num(edr, 'zipf_exponent', '0.8')}</sup>, and takes the ratio of that chart-implied revenue to the audience-only estimate.
            The ratio is smoothed over the last {num(edr, 'intensity_ema_span', '7')} snapshots and bounded to {num(edr, 'intensity_bounds', '0.05 – 10')}×.
          </li>
          <li>
            <strong>Currency.</strong> Robux are converted to USD at the {num(edr, 'developer_share', '0.7')} creator share ×{' '}
            ${num(edr, 'devex_usd_per_robux', '0.0038')} DevEx rate, i.e. estimated developer earnings rather than player spend.
          </li>
        </ul>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Game-pass count and price, like ratio, favorites and age were tested as inputs and add less than 0.01 in rank agreement, so they are
          shown for context but are not part of the formula.
        </p>
      </Section>

      <Section title="Index construction">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Selection.</strong> Experiences are ranked by trailing 7-day mean EDR. The top {num(reb, 'n_constituents', '100')} form the
            index, with buffer rules to limit churn: new entrants must rank ≤ {num(reb, 'enter_rank', '90')}, incumbents stay while ranked ≤{' '}
            {num(reb, 'exit_rank', '130')}. Constituents need a snapshot within {num(reb, 'max_staleness_days', '2')} days and at least{' '}
            {num(reb, 'min_observations_7d', '2')} observations in the window.
          </li>
          <li>
            <strong>Weights.</strong> Proportional to 7-day EDR, capped at {typeof reb?.max_weight === 'number' ? `${reb.max_weight * 100}%` : '10%'}{' '}
            with the excess redistributed pro-rata.
          </li>
          <li>
            <strong>Level.</strong> At each rebalance every constituent receives a fixed number of &quot;shares&quot; so the basket value equals the
            running level (base {num(idx, 'base_level', '1000')}); between rebalances the level is the sum of shares × 7-day EDR, which makes the
            series continuous through composition changes. Constituents missing from a scrape carry their last value forward, reported as
            coverage.
          </li>
          <li>
            <strong>Inception.</strong> The level starts once constituents have (median) {num(idx, 'warmup_observations', '3')} observations in the
            smoothing window, so a single early snapshot cannot define the base.
          </li>
        </ul>
      </Section>

      <Section title="Validation">
        <p>
          Because the Top-Earning chart is a model input, the meaningful test is predictive: using today&apos;s estimate to order experiences by
          their <em>next</em> chart position.
        </p>
        {v && v.n_dates > 0 ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="card rounded-xl p-3">
              <div className="num text-xl font-semibold">{rho(v.next_spearman_model)}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">model</div>
            </div>
            <div className="card rounded-xl p-3">
              <div className="num text-xl font-semibold">{rho(v.next_spearman_ccu_only)}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">players only</div>
            </div>
            <div className="card rounded-xl p-3">
              <div className="num text-xl font-semibold">{rho(v.next_spearman_chart_persistence)}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">chart persistence</div>
            </div>
          </div>
        ) : (
          <p className="text-zinc-500">Validation statistics become available once two or more snapshots exist.</p>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Spearman rank correlation, mean over {v?.n_dates ?? 0} dates (1.00 = identical ordering). Chart persistence is the ceiling set by the
          chart&apos;s own day-to-day stability.
        </p>
      </Section>

      <Section title="Data and limitations">
        <ul className="list-disc space-y-1 pl-5">
          <li>Inputs are one daily snapshot of public Roblox data: concurrent players, lifetime visits, votes, favorites, game passes and the Top-Earning chart.</li>
          <li>A single concurrent-player reading depends on the time of day it is taken; the 7-day smoothing and fixed scrape schedule reduce, but do not remove, this noise.</li>
          <li>The chart&apos;s revenue window and exact definition are not published by Roblox; the Zipf slope and ARPDAU anchor are assumptions, so absolute figures carry wide uncertainty while relative movements are more reliable.</li>
          <li>Dev-product sales, Premium payouts and off-platform revenue are not observable and are only captured indirectly through chart position.</li>
        </ul>
      </Section>
    </section>
  );
}
