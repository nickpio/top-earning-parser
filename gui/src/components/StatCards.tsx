import { fmtCompact, fmtDate, fmtPct, fmtRobux, fmtSigned, fmtUsd, isNum } from '@/lib/format';
import type { Constituent, IndexPoint, Meta } from '@/lib/types';

function Trend({ value, className = '' }: { value: number | null; className?: string }) {
  if (!isNum(value)) return <span className={`text-zinc-400 ${className}`}>—</span>;
  const tone = value > 0 ? 'text-emerald-600 dark:text-emerald-400' : value < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500';
  return (
    <span className={`num font-medium ${tone} ${className}`}>
      {value > 0 ? '▲' : value < 0 ? '▼' : '•'} {fmtPct(Math.abs(value), 2)}
    </span>
  );
}

function Card({ label, value, sub, hint }: { label: string; value: React.ReactNode; sub?: React.ReactNode; hint?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4" title={hint}>
      <div className="label">{label}</div>
      <div className="num text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</div>}
    </div>
  );
}

export function StatCards({ indexLevel, games, meta }: { indexLevel: IndexPoint[]; games: Constituent[]; meta: Meta | null }) {
  const last = indexLevel[indexLevel.length - 1];
  const prev = indexLevel[indexLevel.length - 2];
  const first = indexLevel[0];

  const dayChange = last && prev ? last.index_level - prev.index_level : null;
  const dayPct = last && prev && prev.index_level ? last.index_level / prev.index_level - 1 : null;
  const sinceInception = last && first && first.index_level ? last.index_level / first.index_level - 1 : null;

  const basket = games.reduce((s, g) => s + (g.edr_7d_mean || 0), 0);
  const basketUsd = games.reduce((s, g) => s + (g.edr_7d_mean_usd || 0), 0);
  const weights = [...games].sort((a, b) => b.weight - a.weight).map((g) => g.weight);
  const top5 = weights.slice(0, 5).reduce((s, w) => s + w, 0);
  const top10 = weights.slice(0, 10).reduce((s, w) => s + w, 0);
  const newEntrants = games.filter((g) => g.is_new).length;

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Card
        label="Index level"
        value={last ? last.index_level.toFixed(2) : '—'}
        sub={
          last ? (
            <span className="flex items-center gap-1.5">
              <Trend value={dayPct} />
              <span className="num">({fmtSigned(dayChange, 2)})</span>
              <span>vs prior</span>
            </span>
          ) : (
            'Warming up — needs 3 observations'
          )
        }
        hint="Chain-linked level of the basket's trailing 7-day estimated daily revenue, base 1,000"
      />
      <Card
        label="Since inception"
        value={<Trend value={sinceInception} className="text-2xl" />}
        sub={first ? `Base 1,000 on ${fmtDate(first.date)}` : '—'}
      />
      <Card
        label="Basket EDR (7d avg)"
        value={fmtRobux(basket, 1)}
        sub={`≈ ${fmtUsd(basketUsd, 2)} / day developer earnings`}
        hint="Sum of constituents' trailing 7-day estimated daily revenue in Robux; USD at 70% creator share × DevEx rate"
      />
      <Card
        label="Constituents"
        value={games.length}
        sub={meta ? `of ${meta.universe_size} tracked experiences · ${newEntrants} new` : `${newEntrants} new entrants`}
      />
      <Card
        label="Concentration"
        value={fmtPct(top10, 1)}
        sub={`Top 10 of weight · Top 5: ${fmtPct(top5, 1)}`}
        hint="Weights are proportional to 7-day EDR, capped at 10% per constituent"
      />
      <Card
        label="Coverage"
        value={last ? fmtPct(last.coverage, 1) : '—'}
        sub={last ? `${fmtCompact(last.basket_edr_daily, 1)} R$ unsmoothed basket EDR` : 'Share of basket observed today'}
        hint="Share of the basket (by value) observed in the latest scrape; missing constituents carry their last value forward"
      />
    </section>
  );
}
