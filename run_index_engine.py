from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import pandas as pd

from src.index_engine.parameters import EDRParams, IndexParams, RebalanceParams, RollingParams, StorageParams
from src.index_engine.pipeline import run_pipeline
from src.index_engine.validate import format_agreement, top_earning_agreement


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the RTE100 index engine (EDR model + rolling features + rebalance/exports)."
    )
    parser.add_argument("--runs-dir", default="runs", help="Path to runs/ directory (default: runs)")
    parser.add_argument("--index-data-dir", default="index_data", help="Where parquet stores and exports live")
    parser.add_argument("--rebalance-date", default=None, help="Rebalance date YYYY-MM-DD")
    parser.add_argument("--rebalance-today", action="store_true", help="Rebalance using today's date")
    parser.add_argument(
        "--replay-all",
        action="store_true",
        help="Rebuild membership, index level and exports for every stored snapshot date (use after a model change)",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Print per-date agreement between the EDR model and Roblox's Top-Earning ordering, then exit",
    )
    args = parser.parse_args()

    storage = StorageParams(index_data_dir=args.index_data_dir)

    if args.validate:
        snapshots = pd.read_parquet(Path(storage.index_data_dir) / storage.snapshots_file)
        print(format_agreement(top_earning_agreement(snapshots)))
        return

    rebalance_date = args.rebalance_date
    if args.rebalance_today:
        rebalance_date = date.today().isoformat()

    run_pipeline(
        runs_dir=args.runs_dir,
        rebalance_date=rebalance_date,
        edr_params=EDRParams(),
        rolling_params=RollingParams(),
        rebalance_params=RebalanceParams(),
        storage=storage,
        index_params=IndexParams(),
        replay_all=args.replay_all,
    )


if __name__ == "__main__":
    main()
