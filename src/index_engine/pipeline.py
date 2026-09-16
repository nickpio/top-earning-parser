from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd

from .edr_model import compute_edr
from .index_level import build_index_level_series, write_index_level_exports
from .io_runs import RAW_COLUMNS, discover_pruned_run_files, load_pruned_file, recover_top_earning_rank
from .parameters import (
    MODEL_VERSION,
    EDRParams,
    IndexParams,
    RebalanceParams,
    RollingParams,
    StorageParams,
    params_to_dict,
)
from .rebalance import MEMBERSHIP_COLUMNS, latest_members, rebalance
from .report import write_rebalance_report
from .rolling_features import compute_rolling_features
from .validate import top_earning_agreement

EXPORT_COLUMNS: List[str] = [
    "rebalance_date",
    "rank",
    "prev_rank",
    "rank_change",
    "is_new",
    "universeId",
    "name",
    "developer",
    "rootPlaceId",
    "weight",
    "edr_7d_mean",
    "edr_7d_mean_usd",
    "edr_raw",
    "edr_usd",
    "edr_mom",
    "edr_14d_vol",
    "coverage_7d",
    "obs_7d",
    "snapshot_date",
    "top_earning_rank",
    "avg_ccu",
    "ccu_7d_mean",
    "dau_est",
    "visits",
    "visits_per_day",
    "session_hours",
    "favorites",
    "likes",
    "dislikes",
    "like_ratio",
    "gamePassCount",
    "avgGamePassPrice",
    "paidAccess",
    "paidAccessPrice",
    "ageDays",
    "arpdau",
    "intensity",
    "edr_audience",
    "edr_chart",
]


def _read_parquet_if_exists(path: Path) -> pd.DataFrame:
    if path.exists():
        return pd.read_parquet(path)
    return pd.DataFrame()


# --------------------------------------------------------------------------- #
# Snapshot store
# --------------------------------------------------------------------------- #
def load_snapshot_store(path: Path) -> pd.DataFrame:
    """Raw scrape fields of every stored snapshot (derived columns are dropped)."""
    df = _read_parquet_if_exists(path)
    if df.empty:
        return pd.DataFrame(columns=list(RAW_COLUMNS))
    df["snapshot_date"] = pd.to_datetime(df["snapshot_date"]).dt.date.astype(str)
    if "top_earning_rank" not in df.columns:
        # Legacy stores kept the original scraper's row order; reconstruct the chart position.
        players = pd.to_numeric(df["players"], errors="coerce").fillna(0)
        df["top_earning_rank"] = 0
        for _, idx in df.groupby("snapshot_date", sort=False).groups.items():
            df.loc[idx, "top_earning_rank"] = recover_top_earning_rank(players.loc[idx].to_numpy())
    keep = [c for c in RAW_COLUMNS if c in df.columns]
    return df.loc[:, keep].copy()


def ingest_runs(store: pd.DataFrame, runs_dir: str) -> pd.DataFrame:
    """Upsert pruned run files into the store; a run file is authoritative for its date."""
    frames: List[pd.DataFrame] = []
    for run_date, fp in discover_pruned_run_files(runs_dir):
        frames.append(load_pruned_file(fp, run_date))
    if not frames:
        return store

    new = pd.concat(frames, ignore_index=True)
    new_dates = set(new["snapshot_date"].unique())
    kept = store[~store["snapshot_date"].isin(new_dates)] if not store.empty else store
    merged = pd.concat([kept, new], ignore_index=True)
    merged = merged.drop_duplicates(["snapshot_date", "universeId"], keep="last")
    return merged.sort_values(["snapshot_date", "top_earning_rank"], kind="stable").reset_index(drop=True)


def rebuild_snapshots(runs_dir: str, storage: StorageParams, edr_params: EDRParams) -> pd.DataFrame:
    out_dir = Path(storage.index_data_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    snap_path = out_dir / storage.snapshots_file

    store = ingest_runs(load_snapshot_store(snap_path), runs_dir)
    if store.empty:
        raise RuntimeError(f"No snapshots available: {snap_path} is empty and {runs_dir}/ has no pruned runs")

    snapshots = compute_edr(store, edr_params)
    snapshots = snapshots.sort_values(["snapshot_date", "top_earning_rank"], kind="stable").reset_index(drop=True)
    snapshots.to_parquet(snap_path, index=False)
    print(f"[index_engine] Snapshots: {len(snapshots)} rows over {snapshots['snapshot_date'].nunique()} dates")
    return snapshots


def rebuild_features(snapshots: pd.DataFrame, storage: StorageParams, rolling_params: RollingParams) -> pd.DataFrame:
    feats = compute_rolling_features(snapshots, rolling_params)
    feats.to_parquet(Path(storage.index_data_dir) / storage.features_file, index=False)
    return feats


# --------------------------------------------------------------------------- #
# Exports
# --------------------------------------------------------------------------- #
def export_constituents(membership: pd.DataFrame, ranked: pd.DataFrame, exports_day: Path) -> pd.DataFrame:
    feature_cols = [c for c in ranked.columns if c not in MEMBERSHIP_COLUMNS or c == "universeId"]
    df = membership.merge(ranked.loc[:, feature_cols], on="universeId", how="left")
    cols = [c for c in EXPORT_COLUMNS if c in df.columns]
    df = df.loc[:, cols].sort_values("rank").reset_index(drop=True)

    df.to_csv(exports_day / "rte100.csv", index=False)
    df.to_json(exports_day / "rte100.json", orient="records", indent=2)
    print(f"[index_engine] Constituents: {exports_day / 'rte100.json'}")
    return df


def export_history(
    features: pd.DataFrame,
    membership_all: pd.DataFrame,
    constituents: pd.DataFrame,
    rebalance_date: str,
    exports_day: Path,
    days: int,
) -> None:
    """Compact per-constituent time series consumed by the dashboard's detail panels."""
    end = pd.to_datetime(rebalance_date)
    start = end - pd.Timedelta(days=days)
    ids = constituents["universeId"].tolist()

    f = features[features["universeId"].isin(ids)].copy()
    f["snapshot_date"] = pd.to_datetime(f["snapshot_date"])
    f = f[(f["snapshot_date"] > start) & (f["snapshot_date"] <= end)]

    m = membership_all.copy()
    m["rebalance_date"] = pd.to_datetime(m["rebalance_date"])
    ranks = m.loc[:, ["rebalance_date", "universeId", "rank"]].rename(columns={"rebalance_date": "snapshot_date", "rank": "index_rank"})
    f = f.merge(ranks, on=["snapshot_date", "universeId"], how="left")

    series: Dict[str, List[dict]] = {}
    for uid, g in f.sort_values("snapshot_date").groupby("universeId"):
        series[str(int(uid))] = [
            {
                "d": r.snapshot_date.date().isoformat(),
                "edr": round(float(r.edr_raw), 2),
                "edr7": round(float(r.edr_7d_mean), 2),
                "ccu": float(r.avg_ccu),
                "vpd": None if pd.isna(r.visits_per_day) else round(float(r.visits_per_day), 1),
                "ter": None if pd.isna(r.top_earning_rank) else int(r.top_earning_rank),
                "rank": None if pd.isna(r.index_rank) else int(r.index_rank),
            }
            for r in g.itertuples(index=False)
        ]

    payload = {"rebalance_date": rebalance_date, "days": days, "series": series}
    (exports_day / "rte100_history.json").write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"[index_engine] History: {exports_day / 'rte100_history.json'}")


def export_meta(
    snapshots: pd.DataFrame,
    constituents: pd.DataFrame,
    rebalance_date: str,
    exports_day: Path,
    edr_params: EDRParams,
    rolling_params: RollingParams,
    rebalance_params: RebalanceParams,
    index_params: IndexParams,
) -> dict:
    agreement = top_earning_agreement(snapshots)
    means = agreement.drop(columns=["snapshot_date", "next_date"]).mean(numeric_only=True) if not agreement.empty else None

    def mean_of(col: str) -> Optional[float]:
        if means is None or col not in means or pd.isna(means[col]):
            return None
        return float(means[col])

    meta = {
        "model_version": MODEL_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rebalance_date": rebalance_date,
        "n_constituents": int(len(constituents)),
        "universe_size": int((snapshots["snapshot_date"] == constituents["snapshot_date"].max()).sum()) if not constituents.empty else 0,
        "snapshot_dates": sorted(snapshots["snapshot_date"].unique().tolist()),
        "robux_to_usd": edr_params.robux_to_usd,
        "params": params_to_dict(edr_params, rolling_params, rebalance_params, index_params),
        "validation": {
            "description": (
                "Spearman rank correlation with Roblox's Top-Earning chart position (rank 1 = top earner, "
                "so agreement is negative; -1 is perfect). `next_*` values predict the following snapshot's "
                "chart position from today's estimate — the out-of-sample test, since the chart is a model input."
            ),
            "n_dates": int(len(agreement)),
            "spearman_model": mean_of("spearman_model"),
            "spearman_ccu_only": mean_of("spearman_ccu_only"),
            "next_spearman_model": mean_of("next_spearman_model"),
            "next_spearman_ccu_only": mean_of("next_spearman_ccu_only"),
            "next_spearman_chart_persistence": mean_of("next_spearman_chart_persistence"),
        },
    }
    (exports_day / "rte100_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


# --------------------------------------------------------------------------- #
# Rebalance
# --------------------------------------------------------------------------- #
def run_rebalance(
    snapshots: pd.DataFrame,
    features: pd.DataFrame,
    rebalance_date: str,
    storage: StorageParams,
    edr_params: EDRParams,
    rolling_params: RollingParams,
    rebalance_params: RebalanceParams,
    index_params: IndexParams,
) -> None:
    out_dir = Path(storage.index_data_dir)
    exports_root = out_dir / "exports"
    exports_day = exports_root / rebalance_date
    exports_day.mkdir(parents=True, exist_ok=True)

    membership_path = out_dir / storage.membership_file
    membership_all = _read_parquet_if_exists(membership_path)
    if not membership_all.empty:
        membership_all["rebalance_date"] = pd.to_datetime(membership_all["rebalance_date"]).dt.date.astype(str)
        # Re-running a date replaces that rebalance instead of duplicating it.
        membership_all = membership_all[membership_all["rebalance_date"] < rebalance_date]

    prior = latest_members(membership_all) if not membership_all.empty else None
    result = rebalance(features, rebalance_date, rebalance_params, prior_membership=prior)
    if result.membership.empty:
        raise RuntimeError(f"No eligible constituents for {rebalance_date}")

    membership_all = pd.concat([membership_all, result.membership], ignore_index=True)
    membership_all.to_parquet(membership_path, index=False)

    constituents = export_constituents(result.membership, result.ranked, exports_day)

    index_ts = build_index_level_series(features, membership_all, index_params, edr_params.robux_to_usd)
    write_index_level_exports(index_ts, exports_dir=str(exports_day))

    export_history(features, membership_all, constituents, rebalance_date, exports_day, index_params.history_days)
    meta = export_meta(snapshots, constituents, rebalance_date, exports_day, edr_params, rolling_params, rebalance_params, index_params)

    reports_dir = exports_root / "Weekly Reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    write_rebalance_report(
        exports_dir=str(reports_dir),
        rebalance_date=rebalance_date,
        constituents=constituents,
        membership_history=membership_all,
        index_ts=index_ts,
        meta=meta,
        robux_to_usd=edr_params.robux_to_usd,
    )
    print(f"[index_engine] Rebalance complete: {rebalance_date} -> {exports_day}")


def run_pipeline(
    runs_dir: str,
    rebalance_date: Optional[str],
    edr_params: EDRParams,
    rolling_params: RollingParams,
    rebalance_params: RebalanceParams,
    storage: StorageParams,
    index_params: IndexParams = IndexParams(),
    replay_all: bool = False,
) -> None:
    """
    1) merge new runs into the snapshot store and re-price every row with the EDR model
    2) rebuild rolling features
    3) rebalance for `rebalance_date` (or every stored date when replay_all is set)
    """
    snapshots = rebuild_snapshots(runs_dir=runs_dir, storage=storage, edr_params=edr_params)
    features = rebuild_features(snapshots=snapshots, storage=storage, rolling_params=rolling_params)

    if replay_all:
        membership_path = Path(storage.index_data_dir) / storage.membership_file
        if membership_path.exists():
            membership_path.unlink()
        dates = sorted(snapshots["snapshot_date"].unique().tolist())
    elif rebalance_date is not None:
        dates = [pd.to_datetime(rebalance_date).date().isoformat()]
    else:
        dates = []

    for d in dates:
        run_rebalance(snapshots, features, d, storage, edr_params, rolling_params, rebalance_params, index_params)
