from __future__ import annotations

import pandas as pd

from .parameters import RollingParams

def compute_rolling_features(history: pd.DataFrame, params: RollingParams) -> pd.DataFrame:
    """
    history: time-series snapshots containing at minimum:
    snapshot_date, universeID, avg_ccu, edr_raw

    Produces rolling/EMA features per game:
    edr_7d_mean, edr_ema7, edr_ema30, edr_mom, edr_14_vol
    ccu_7d_mean
    coverage_7d
    """

    df = history.copy()
    df["snapshot_date"] = pd.to_datetime(df["snapshot_date"])
    df = df.sort_values(["universeId", "snapshot_date"])

    g = df.groupby("universeId", group_keys=False)

    # -- Coverage
    df["coverage_7d"] = g["edr_raw"].transform(lambda s: s.rolling(7, min_periods=1).count() / 7.0)

    # -- Rolling Means
    df["edr_7d_mean"] = g["edr_raw"].transform(lambda s: s.rolling(7, min_periods=params.mean_7d_min_periods).mean())
    df["ccu_7d_mean"] = g["avg_ccu"].transform(lambda s: s.rolling(7, min_periods=params.mean_7d_min_periods).mean())

    # -- Rolling means fallback
    df["edr_7d_mean"] = df["edr_7d_mean"].fillna(df["edr_raw"])
    df["ccu_7d_mean"] = df["ccu_7d_mean"].fillna(df["avg_ccu"])

    # -- EMAs and momentum
    df["edr_ema7"] = g["edr_raw"].transform(lambda s: s.ewm(span=params.ema_fast, adjust=False).mean())
    df["edr_ema30"] = g["edr_raw"].transform(lambda s: s.ewm(span=params.ema_slow, adjust=False).mean())
    df["edr_mom"] = (df["edr_ema7"] / df["edr_ema30"].replace({0: pd.NA})).fillna(0.0)

    # -- 14d volatility
    rolling_std = g["edr_raw"].transform(lambda s: s.rolling(14, min_periods=2).std())
    rolling_mean = g["edr_raw"].transform(lambda s: s.rolling(14, min_periods=2).mean())
    df["edr_14d_vol"] = (rolling_std / rolling_mean.replace({0: pd.NA})).fillna(0.0)

    return df