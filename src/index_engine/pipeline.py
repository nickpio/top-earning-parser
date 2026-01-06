from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, Tuple, Union, cast
from .report import write_weekly_report

import pandas as pd

from .io_runs import discover_pruned_run_files, load_pruned_file
from .edr_model import compute_edr_daily
from .rolling_features import compute_rolling_features
from .rebalance import rebalance_weekly, RebalanceResult
from .parameters import EDRParams, RollingParams, RebalanceParams, StorageParams
from .index_level import build_index_level_series, write_index_level_exports


def export_rebalance_outputs(
    result_membership: pd.DataFrame,
    ranked_universe: pd.DataFrame,
    snapshots: pd.DataFrame,
    out_dir: Path,
) -> None:
    """
    Writes:
      - rte100_<rebalance_date>.csv
      - rte100_<rebalance_date>.json
      - rte100_latest.csv
      - rte100_latest.json

    Includes human-friendly fields by joining membership with latest snapshot metadata.
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    if result_membership.empty:
        return

    # membership has: rebalance_date, universeId, rank, in_index, weight
    reb_date = str(result_membership["rebalance_date"].iloc[0])

    # Get latest snapshot (as-of rebalance date) to pull name/developer + latest metrics
    snaps = snapshots.copy()
    snaps["snapshot_date"] = pd.to_datetime(snaps["snapshot_date"]).dt.date

    # For each universeId, get latest snapshot row up to rebalance date
    asof = pd.to_datetime(reb_date).date()
    snaps = cast(pd.DataFrame, snaps[snaps["snapshot_date"] <= asof])
    latest_snap = cast(
        pd.DataFrame,
        snaps.sort_values(by=["universeId", "snapshot_date"])
        .groupby("universeId", as_index=False)
        .tail(1)
    )

    # Join membership with latest snapshot + ranked info (score, edr_7d_mean, etc.)
    export_df = result_membership.merge(
        latest_snap,
        on="universeId",
        how="left",
        suffixes=("", "_snap"),
    )

    # ranked_universe contains score + feature columns; join for visibility
    if ranked_universe is not None and not ranked_universe.empty:
        export_df = export_df.merge(
            ranked_universe[["universeId", "score", "edr_7d_mean", "edr_mom", "edr_14d_vol", "coverage_7d"]],
            on="universeId",
            how="left",
        )

    # Keep it readable
    preferred_cols = [
        "rebalance_date", "rank", "universeId", "name", "developer",
        "weight",
        "edr_7d_mean", "edr_mom", "edr_14d_vol", "coverage_7d",
        "avg_ccu", "visits", "favorites", "likes",
        "monetization_count", "median_price", "price_dispersion",
        "engagement_score", "edr_raw",
        "score",
    ]
    cols = [c for c in preferred_cols if c in export_df.columns]
    export_df_filtered = cast(pd.DataFrame, export_df[cols])
    export_df = cast(pd.DataFrame, export_df_filtered.sort_values(by="rank").reset_index(drop=True))

    # Write dated outputs
    csv_path = out_dir / f"rte100_{reb_date}.csv"
    json_path = out_dir / f"rte100_{reb_date}.json"

    export_df.to_csv(csv_path, index=False)
    export_df.to_json(json_path, orient="records", indent=2)

    # Write latest symlinks (copy files)
    export_df.to_csv(out_dir / "rte100_latest.csv", index=False)
    export_df.to_json(out_dir / "rte100_latest.json", orient="records", indent=2)

    print(f"[index_engine] Exported: {csv_path}")
    print(f"[index_engine] Exported: {json_path}")
    print(f"[index_engine] Exported: {out_dir/'rte100_latest.csv'}")
    print(f"[index_engine] Exported: {out_dir/'rte100_latest.json'}")

def _ensure_dir(p: Union[str, Path]) -> Path:
    p = Path(p)
    p.mkdir(parents=True, exist_ok=True)
    return p


def load_parquet_if_exists(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path) if path.exists() else pd.DataFrame()


def save_parquet(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)


def update_snapshots_from_runs(
    runs_dir: Union[str, Path],
    storage: StorageParams,
    edr_params: EDRParams,
) -> pd.DataFrame:
    """
    Reads all run files and produces an append-only snapshots table (deduped by snapshot_date+universeId).
    """
    runs_dir = Path(runs_dir)
    data_dir = _ensure_dir(storage.index_data_dir)
    snapshots_path = data_dir / storage.snapshots_file

    existing = load_parquet_if_exists(snapshots_path)

    run_files = discover_pruned_run_files(runs_dir)
    if not run_files:
        raise FileNotFoundError(f"No pruned runs found under {runs_dir}")

    frames = []
    for date_str, fp in run_files:
        df_day = load_pruned_file(fp, snapshot_date=date_str)
        df_day = compute_edr_daily(df_day, edr_params)

        keep = [
            "snapshot_date", "universeId", "name", "developer",
            "avg_ccu", "visits", "favorites", "likes",
            "monetization_count", "median_price", "price_dispersion",
            "engagement_score", "dau_est", "pcr", "aspu",
            "spend_revenue", "premium_revenue", "edr_raw",
        ]
        keep = [c for c in keep if c in df_day.columns]
        frames.append(df_day[keep].copy())

    snapshots_new = pd.concat(frames, ignore_index=True)

    if not existing.empty:
        merged = pd.concat([existing, snapshots_new], ignore_index=True)
    else:
        merged = snapshots_new

    merged = merged.sort_values(by=["snapshot_date", "universeId"]).drop_duplicates(
        subset=["snapshot_date", "universeId"], keep="last"
    )

    save_parquet(merged, snapshots_path)
    return merged


def rebuild_features(
    snapshots: pd.DataFrame,
    storage: StorageParams,
    rolling_params: RollingParams,
) -> pd.DataFrame:
    data_dir = _ensure_dir(storage.index_data_dir)
    features_path = data_dir / storage.features_file

    features = compute_rolling_features(snapshots, rolling_params)
    save_parquet(features, features_path)
    return features


def run_weekly_rebalance(
    features: pd.DataFrame,
    rebalance_date: str,
    storage: StorageParams,
    rebalance_params: RebalanceParams,
) -> RebalanceResult:
    data_dir = _ensure_dir(storage.index_data_dir)
    membership_path = data_dir / storage.membership_file

    prior = load_parquet_if_exists(membership_path)

    result = rebalance_weekly(
        features=features,
        rebalance_date=rebalance_date,
        params=rebalance_params,
        prior_membership=prior if not prior.empty else None,
    )

    # append membership row(s)
    if prior.empty:
        merged = result.membership
    else:
        merged = pd.concat([prior, result.membership], ignore_index=True)

    save_parquet(merged, membership_path)

    # -- Export human-readable index outputs
    exports_dir = Path(storage.index_data_dir) / "exports"
    export_rebalance_outputs(
        result_membership=result.membership,
        ranked_universe=result.ranked,
        snapshots=pd.read_parquet(Path(storage.index_data_dir) / storage.snapshots_file),
        out_dir=exports_dir,
    )
    # Build weekly report (markdown)
    membership_history = prior if not prior.empty else None
    exports_dir = Path(storage.index_data_dir) / "exports"

    # Rebalance date as ISO string
    reb_date_iso = str(pd.to_datetime(result.membership["rebalance_date"].iloc[0]).date())

    # Load the latest exported top-100 table (human-readable export)
    export_df = pd.read_csv(exports_dir / "rte100_latest.csv")

    # Use prior membership history (for entrants/exits) if available
    membership_history = prior if (prior is not None and not prior.empty) else None

    report_path = write_weekly_report(
        exports_dir=str(exports_dir),
        rebalance_date=reb_date_iso,
        export_df=export_df,
        membership_history=membership_history,
    )
    snapshots = pd.read_parquet(Path(storage.index_data_dir) / storage.snapshots_file)
    membership_all = pd.read_parquet(Path(storage.index_data_dir) / storage.membership_file)

    index_ts = build_index_level_series(
        snapshots=snapshots,
        membership_history=membership_all,
        base_level=1000.0,
        eps=1.0,
    )

    write_index_level_exports(index_ts, exports_dir=str(exports_dir))
    print(f"[index_engine] Weekly report written: {report_path}")
    return result


def run_pipeline(
    runs_dir: Union[str, Path] = "runs",
    rebalance_date: Optional[str] = None,
    edr_params: EDRParams = EDRParams(),
    rolling_params: RollingParams = RollingParams(),
    rebalance_params: RebalanceParams = RebalanceParams(),
    storage: StorageParams = StorageParams(),
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Daily: update snapshots + rebuild features
    Weekly: optional rebalance if rebalance_date is provided
    """
    snapshots = update_snapshots_from_runs(runs_dir, storage, edr_params)
    features = rebuild_features(snapshots, storage, rolling_params)

    if rebalance_date is not None:
        _ = run_weekly_rebalance(features, rebalance_date, storage, rebalance_params)

    return snapshots, features