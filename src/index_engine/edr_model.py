from __future__ import annotations

import numpy as np
import pandas as pd

from .parameters import EDRParams

# Columns produced by compute_edr (everything else in the store is raw input)
DERIVED_COLUMNS: tuple[str, ...] = (
    "avg_ccu",
    "visits_per_day",
    "session_hours",
    "like_ratio",
    "dau_est",
    "edr_audience",
    "edr_chart",
    "intensity_raw",
    "intensity",
    "arpdau",
    "edr_raw",
    "edr_usd",
)


def _num(df: pd.DataFrame, col: str) -> pd.Series:
    if col in df.columns:
        return pd.to_numeric(df[col], errors="coerce").astype("float64")
    return pd.Series(np.nan, index=df.index, dtype="float64")


def add_visits_per_day(df: pd.DataFrame) -> pd.DataFrame:
    """
    Daily play sessions from the lifetime `visits` counter of consecutive snapshots.
    Uses exact hours between scrapes when `scraped_at` is available, else calendar days.
    """
    df = df.sort_values(["universeId", "snapshot_date"], kind="stable").copy()
    by_game = df["universeId"]

    dates = pd.to_datetime(df["snapshot_date"], errors="coerce")
    hours = (dates - dates.groupby(by_game, sort=False).shift(1)).dt.total_seconds() / 3600.0

    if "scraped_at" in df.columns:
        ts = pd.to_datetime(df["scraped_at"], errors="coerce", utc=True)
        exact = (ts - ts.groupby(by_game, sort=False).shift(1)).dt.total_seconds() / 3600.0
        hours = exact.where(exact.notna() & (exact > 0), hours)

    visits = _num(df, "visits")
    delta = visits - visits.groupby(by_game, sort=False).shift(1)
    df["visits_per_day"] = ((delta / hours) * 24.0).where((delta > 0) & (hours > 0))
    return df


def add_context_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Descriptive engagement metrics shown alongside the estimate (not inputs to it)."""
    df = add_visits_per_day(df)
    ccu = df["avg_ccu"]
    vpd = df["visits_per_day"]
    df["session_hours"] = (ccu * 24.0 / vpd).where((vpd > 0) & (ccu > 0))

    likes = _num(df, "likes").fillna(0.0)
    dislikes = _num(df, "dislikes").fillna(0.0)
    votes = likes + dislikes
    df["like_ratio"] = (likes / votes).where(votes > 0)
    return df


def compute_edr(snapshots: pd.DataFrame, params: EDRParams) -> pd.DataFrame:
    """
    Estimated Daily Revenue for every (universeId, snapshot_date) row.

    Requires the full history because monetization intensity is smoothed per
    experience across its consecutive snapshots.
    """
    if snapshots.empty:
        return snapshots.copy()

    df = snapshots.copy()
    if "avg_ccu" not in df.columns or df["avg_ccu"].isna().all():
        for c in ("players", "playing", "ccu", "concurrentPlayers"):
            if c in df.columns:
                df["avg_ccu"] = _num(df, c)
                break
        else:
            df["avg_ccu"] = 0.0
    df["avg_ccu"] = _num(df, "avg_ccu").fillna(0.0).clip(lower=0.0)

    df = add_context_metrics(df)

    # --- audience-only estimate: the anchor for total spend --------------------
    df["dau_est"] = params.dau_per_ccu * df["avg_ccu"]
    df["edr_audience"] = df["dau_est"] * params.base_arpdau_robux

    # --- chart-implied revenue: redistribute each day's total by chart position --
    rank = _num(df, "top_earning_rank")
    zipf = np.power(rank.where(rank >= 1), -params.zipf_exponent)
    by_date = df["snapshot_date"]
    total_audience = df["edr_audience"].groupby(by_date).transform("sum")
    total_zipf = zipf.groupby(by_date).transform("sum")
    df["edr_chart"] = zipf * (total_audience / total_zipf.where(total_zipf > 0))

    # --- monetization intensity: chart-implied vs audience-only, smoothed -------
    audience = df["edr_audience"].where(df["edr_audience"] > 0)
    df["intensity_raw"] = (df["edr_chart"] / audience).clip(*params.intensity_bounds)

    log_int = np.log(df["intensity_raw"])
    smoothed = log_int.groupby(df["universeId"], sort=False).transform(
        lambda s: s.ewm(span=params.intensity_ema_span, adjust=False, ignore_na=True).mean()
    )
    smoothed = smoothed.groupby(df["universeId"], sort=False).ffill()
    df["intensity"] = np.exp(smoothed).clip(*params.intensity_bounds).fillna(1.0)

    df["arpdau"] = params.base_arpdau_robux * df["intensity"]
    unscaled = df["dau_est"] * df["arpdau"]

    # Keep each day's total pinned to the audience anchor; the chart only redistributes it.
    total_unscaled = unscaled.groupby(by_date).transform("sum")
    scale = (total_audience / total_unscaled.where(total_unscaled > 0)).fillna(1.0)
    df["edr_raw"] = (unscaled * scale).clip(lower=0.0)
    df["arpdau"] = df["arpdau"] * scale
    df["edr_usd"] = df["edr_raw"] * params.robux_to_usd

    return df
