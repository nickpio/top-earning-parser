from __future__ import annotations

import argparse
from datetime import date

from src.index_engine.pipeline import run_pipeline
from src.index_engine.parameters import EDRParams, RollingParams, RebalanceParams, StorageParams


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Roblox index engine (EDR + rolling features + optional rebalance).")
    parser.add_argument("--runs-dir", default="runs", help="Path to runs/ directory (default: runs)")
    parser.add_argument("--rebalance-date", default=None, help="Rebalance date YYYY-MM-DD (optional)")
    parser.add_argument("--rebalance-today", action="store_true", help="Rebalance using today's date")
    args = parser.parse_args()

    rebalance_date = args.rebalance_date
    if args.rebalance_today:
        rebalance_date = date.today().isoformat()

    run_pipeline(
        runs_dir=args.runs_dir,
        rebalance_date=rebalance_date,
        edr_params=EDRParams(alpha=20.0, base_rate=0.01, gamma=0.02),
        rolling_params=RollingParams(),
        rebalance_params=RebalanceParams(),
        storage=StorageParams(index_data_dir="index_data"),
    )


if __name__ == "__main__":
    main()