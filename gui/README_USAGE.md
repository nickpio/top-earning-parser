# RTE100 Index Dashboard

A Next.js dashboard for the RTE100 (Roblox Top-Earning 100) index: a revenue-weighted
index of the 100 highest-earning Roblox experiences, built from the estimated daily
revenue (EDR) model in `../src/index_engine`.

## Features

- **Stat cards** – index level and 1-day change, performance since inception, basket EDR
  (Robux and estimated USD developer earnings), constituent count, concentration and coverage.
- **Interactive index chart** – responsive SVG line/area chart with hover tooltip and crosshair,
  1M / 3M / 6M / 1Y / All ranges, an "Index level" vs "Basket EDR" toggle and a base-1,000
  reference line.
- **Constituents table** – search by experience, creator or universe ID; sortable columns with
  explanatory hints; rank-change badges; weight bars; show top 25 / all 100.
- **Per-game detail panels** – click any row to expand a panel with:
  - the revenue estimate build-up (audience → monetization intensity → EDR, latest and 7-day),
  - engagement & catalogue metrics (chart position, rank move, visits/day, session length,
    like ratio, favorites, game passes, paid access, age, momentum, volatility),
  - 90-day sparklines of EDR, concurrent players and Roblox chart position (loaded lazily),
  - a link to the experience on Roblox.
- **Rebalance date selector** – browse any historical rebalance (`/?date=YYYY-MM-DD`).
- **Methodology** – the formula, index rules, validation statistics and limitations, rendered
  from the parameters published with each rebalance.
- **Dark mode** – follows the system preference.

## Getting Started

### Prerequisites

- Node.js 20+
- Index exports in `../index_data/exports/` (generate with `python run_index_engine.py --replay-all`
  from the repository root), or set `RTE_DATA_DIR` to a directory with the same layout.

### Installation

```bash
cd gui
npm install
```

### Development / production

```bash
npm run dev      # http://localhost:3000
npm run build && npm start
npm run lint
```

## Project Structure

```
gui/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── index-data/            # latest snapshot, or a specific date
│   │   │   └── games/[universeId]/    # per-constituent history for the detail panels
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # server component: loads data, renders the dashboard
│   │   └── globals.css
│   ├── components/
│   │   ├── Header.tsx / DateSelector.tsx
│   │   ├── StatCards.tsx
│   │   ├── IndexChart.tsx
│   │   ├── ConstituentsTable.tsx      # search, sort, expandable rows
│   │   ├── GameDetails.tsx            # per-game detail panel
│   │   ├── Sparkline.tsx
│   │   └── Methodology.tsx
│   └── lib/
│       ├── data.ts                    # server-side readers for the export files
│       ├── format.ts                  # number/date formatting helpers
│       └── types.ts
└── public/
```

## API Endpoints

- `GET /api/index-data` – latest rebalance: `{ date, availableDates, indexLevel, games, meta }`
- `GET /api/index-data/[date]` – the same payload for a specific rebalance date (`YYYY-MM-DD`)
- `GET /api/games/[universeId]?date=YYYY-MM-DD` – daily history of one constituent
  (`d`, `edr`, `edr7`, `ccu`, `vpd`, `ter` = Roblox chart position, `rank` = index rank)

## Data Format

The dashboard reads `../index_data/exports/<YYYY-MM-DD>/`:

```
rte100.json / rte100.csv        # constituents with weights, EDR and context metrics
rte100_index_level.json / .csv  # index level series (empty before inception)
rte100_history.json             # compact 90-day series per constituent
rte100_meta.json                # model version, parameters, validation statistics
```

## Key Metrics

- **EDR (Estimated Daily Revenue)** – `DAU × base ARPDAU × monetization intensity`, in Robux.
  DAU is scaled from concurrent players; intensity is inferred from the experience's position
  in Roblox's Top-Earning chart relative to its audience, smoothed over recent snapshots.
- **EDR · 7d avg** – trailing 7-day mean of EDR; drives ranking, weights and the index level.
- **USD** – Robux × 70% creator share × DevEx rate (estimated developer earnings).
- **Weight** – share of 7-day EDR within the basket, capped at 10%.
- **Momentum** – 7-day ÷ 30-day exponential moving average of EDR.
- **Index level** – chain-linked, base 1,000; continuous through rebalances.

## Technologies

- Next.js 16 (App Router, server components), React 19, TypeScript, Tailwind CSS 4
