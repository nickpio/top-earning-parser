from __future__ import annotations

import numpy as np
import pandas as pd

from .parameters import RollingParams

FEATURE_COLUMNS: tuple[str, ...] = (
    "obs_7d",
    "coverage_7d",
    "edr_7d_mean",
    "edr_7d_mean_usd",
    "ccu_7d_mean",
    "edr_ema_fast",
    "edr_ema_slow",
    "edr_mom",
    "edr_14d_vol",
)


def _time_rolling(df: pd.DataFrame, col: str, window_days: int, func: str, min_periods: int = 1) -> pd.Series:
    """Calendar-day rolling aggregate per universeId, aligned to df.index."""
    roll = df.groupby("universeId", sort=False).rolling(
        f"{window_days}D", on="snapshot_date", min_periods=min_periods
    )[col]
    out = getattr(roll, func)()  # indexed by (universeId, snapshot_date)
    key = pd.MultiIndex.from_frame(df.loc[:, ["universeId", "snapshot_date"]])
    return pd.Series(out.reindex(key).to_numpy(), index=df.index, dtype="float64")


def compute_rolling_features(history: pd.DataFrame, params: RollingParams) -> pd.DataFrame:
    """
    history: snapshot rows with at least snapshot_date, universeId, avg_ccu, edr_raw, edr_usd.

    Windows are calendar-based so missing days shorten the sample instead of
    silently stretching the window across gaps.
    """
    if history.empty:
        return history.copy()

    df = history.copy()
    df["snapshot_date"] = pd.to_datetime(df["snapshot_date"])
    df = df.sort_values(["universeId", "snapshot_date"], kind="stable")
    g = df.groupby("universeId", sort=False)

    w = params.mean_window_days
    df["obs_7d"] = _time_rolling(df, "edr_raw", w, "count")
    df["coverage_7d"] = df["obs_7d"] / float(w)
    df["edr_7d_mean"] = _time_rolling(df, "edr_raw", w, "mean")
    df["edr_7d_mean_usd"] = _time_rolling(df, "edr_usd", w, "mean")
    df["ccu_7d_mean"] = _time_rolling(df, "avg_ccu", w, "mean")

    df["edr_ema_fast"] = g["edr_raw"].transform(lambda s: s.ewm(span=params.ema_fast, adjust=False).mean())
    df["edr_ema_slow"] = g["edr_raw"].transform(lambda s: s.ewm(span=params.ema_slow, adjust=False).mean())
    slow = df["edr_ema_slow"].where(df["edr_ema_slow"] > 0)
    df["edr_mom"] = (df["edr_ema_fast"] / slow).fillna(1.0)

    vw = params.vol_window_days
    std = _time_rolling(df, "edr_raw", vw, "std", min_periods=params.vol_min_periods)
    mean = _time_rolling(df, "edr_raw", vw, "mean", min_periods=params.vol_min_periods)
    df["edr_14d_vol"] = (std / mean.where(mean > 0)).replace([np.inf, -np.inf], np.nan).fillna(0.0)

    df["snapshot_date"] = df["snapshot_date"].dt.date.astype(str)
    return df.reset_index(drop=True)
