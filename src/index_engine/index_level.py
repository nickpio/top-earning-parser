from __future__ import annotations

from pathlib import Path
from typing import List, Optional, cast
import math

import pandas as pd


def _as_df(obj: object) -> pd.DataFrame:
    if isinstance(obj, pd.DataFrame):
        return obj
    if isinstance(obj, pd.Series):
        return obj.to_frame()
    return pd.DataFrame()


def _series_float(df: pd.DataFrame, col: str, default: float = 0.0) -> pd.Series:
    if col in df.columns:
        raw = pd.to_numeric(df[col], errors="coerce")
        s = pd.Series(raw, index=df.index, dtype="float64").fillna(default)
        return cast(pd.Series, s)
    return pd.Series([default] * len(df), index=df.index, dtype="float64")


def _series_dt(df: pd.DataFrame, col: str) -> pd.Series:
    """
    Normalize to pandas Timestamp (normalized to midnight).
    Returns Series[Timestamp] aligned to df.index.
    """
    if col not in df.columns:
        return pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")
    raw = pd.to_datetime(df[col], errors="coerce")
    s = pd.Series(raw, index=df.index).dt.normalize()
    return cast(pd.Series, s)


def _filter_df(df: pd.DataFrame, mask: pd.Series) -> pd.DataFrame:
    out = df.loc[mask].copy()
    return cast(pd.DataFrame, out)


def build_index_level_series(
    snapshots: pd.DataFrame,
    membership_history: pd.DataFrame,
    base_level: float = 1000.0,
    eps: float = 1.0,
) -> pd.DataFrame:
    """
    Strict-safe index level series.

    Inputs:
      snapshots: must include snapshot_date, universeId, edr_raw
      membership_history: must include rebalance_date, universeId, weight, in_index (optional)

    Output columns:
      date, index_level, daily_return, coverage
    """
    snaps = _as_df(snapshots).copy()
    mem = _as_df(membership_history).copy()

    # --- Validate required columns (runtime safety) ---
    for col in ["snapshot_date", "universeId", "edr_raw"]:
        if col not in snaps.columns:
            raise ValueError(f"snapshots missing required column: {col}")

    for col in ["rebalance_date", "universeId", "weight"]:
        if col not in mem.columns:
            raise ValueError(f"membership_history missing required column: {col}")

    # --- Normalize dates + numeric types ---
    snaps["snapshot_date"] = _series_dt(snaps, "snapshot_date")
    mem["rebalance_date"] = _series_dt(mem, "rebalance_date")

    snaps["edr_raw"] = _series_float(snaps, "edr_raw", 0.0)
    mem["weight"] = _series_float(mem, "weight", 0.0)

    # Keep members only (if in_index column exists)
    if "in_index" in mem.columns:
        # Avoid .query() for strict mode
        in_index = mem["in_index"] == True  # noqa: E712
        mem = _filter_df(mem, cast(pd.Series, in_index))

    # Drop rows with missing dates
    snaps = _filter_df(snaps, cast(pd.Series, snaps["snapshot_date"].notna()))
    mem = _filter_df(mem, cast(pd.Series, mem["rebalance_date"].notna()))

    # If no rebalance history, cannot build an index
    if len(mem) == 0:
        raise ValueError("membership_history has no valid rebalance rows")

    # --- Build per-game previous-day EDR to compute returns ---
    snaps = snaps.loc[:, ["snapshot_date", "universeId", "edr_raw"]].copy()
    snaps = snaps.sort_values(by=["universeId", "snapshot_date"], kind="stable")
    snaps["edr_prev"] = snaps.groupby("universeId")["edr_raw"].shift(1)

    # Log return with eps stabilizer; first observation gets 0 log return
    prev_s = pd.Series(snaps["edr_prev"], index=snaps.index).fillna(snaps["edr_raw"])
    edr_s = pd.Series(snaps["edr_raw"], index=snaps.index)

    eps_f = float(eps)
    log_rets: List[float] = []

    # Pure-Python loop avoids numpy/pandas-stub typing issues in strict mode
    for edr_v, prev_v in zip(edr_s.tolist(), prev_s.tolist()):
        a = float(edr_v) + eps_f
        b = float(prev_v) + eps_f
        if b <= 0.0 or a <= 0.0:
            log_rets.append(0.0)
        else:
            log_rets.append(math.log(a / b))

    snaps["log_ret"] = pd.Series(log_rets, index=snaps.index, dtype="float64")

    # --- Map each snapshot_date -> effective rebalance_date (most recent <= date) ---
    # Create sorted unique rebalance dates
    rebal_dates = sorted(set(cast(pd.Series, mem["rebalance_date"]).dropna().tolist()))
    if len(rebal_dates) == 0:
        raise ValueError("No rebalance dates found after normalization")

    # Unique snapshot dates
    snap_dates = sorted(set(cast(pd.Series, snaps["snapshot_date"]).dropna().tolist()))
    if len(snap_dates) == 0:
        raise ValueError("No snapshot dates found after normalization")

    # Build mapping table date -> effective rebalance_date
    # (simple linear scan; fast enough for daily data)
    eff_reb: List[pd.Timestamp] = []
    j = 0
    current = rebal_dates[0]
    for d in snap_dates:
        while j + 1 < len(rebal_dates) and rebal_dates[j + 1] <= d:
            j += 1
            current = rebal_dates[j]
        eff_reb.append(current)

    map_df = pd.DataFrame({"snapshot_date": snap_dates, "rebalance_date": eff_reb})
    snaps = snaps.merge(map_df, on="snapshot_date", how="left")

    # --- Join weights by (rebalance_date, universeId) ---
    weights = mem.loc[:, ["rebalance_date", "universeId", "weight"]].copy()
    snaps = snaps.merge(weights, on=["rebalance_date", "universeId"], how="inner")

    # Coverage sanity: sum of weights available that day
    # Weighted log return per row
    snaps["w_log_ret"] = snaps["weight"] * snaps["log_ret"]

    daily_log = snaps.groupby("snapshot_date")["w_log_ret"].sum()
    daily_cov = snaps.groupby("snapshot_date")["weight"].sum()

    daily = pd.DataFrame(
        {
            "date": daily_log.index,
            "daily_log_return": daily_log.values,
            "coverage": daily_cov.reindex(daily_log.index).values,
        }
    ).sort_values(by=["date"], kind="stable")

    # Convert log return to simple return for reporting convenience
    daily_returns: List[float] = []
    for lr in daily["daily_log_return"].tolist():
        daily_returns.append(math.exp(float(lr)) - 1.0)
    daily["daily_return"] = pd.Series(daily_returns, index=daily.index, dtype="float64")

    # Build index level using log returns
    levels: List[float] = []
    level = float(base_level)
    for lr in daily["daily_log_return"].tolist():
        level *= math.exp(float(lr))
        levels.append(level)

    daily["index_level"] = levels

    return daily.loc[:, ["date", "index_level", "daily_return", "daily_log_return", "coverage"]].copy()


def write_index_level_exports(out: pd.DataFrame, exports_dir: str) -> None:
    out_dir = Path(exports_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / "rte100_index_level.csv"
    json_path = out_dir / "rte100_index_level.json"

    df = _as_df(out).copy()
    df.to_csv(csv_path, index=False)
    df.to_json(json_path, orient="records", indent=2, date_format="iso")

    print(f"[index_engine] Index level CSV: {csv_path}")
    print(f"[index_engine] Index level JSON: {json_path}")