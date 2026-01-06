from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, cast

import pandas as pd

from .parameters import RebalanceParams

@dataclass(frozen=True)
class RebalanceResult:
    membership: pd.DataFrame # -- universeId, rebalance_date, rank, in_index, weight
    ranked: pd.DataFrame # -- ranked universe for debugging


def _score_v1(latest: pd.DataFrame) -> pd.Series:
    """
    Minimal composite score for weekly selection:

    - level: edr_7d_mean
    - momentum: edr_mom
    - risk penalty: edr_14d_vol

    Score is cross-sectional z-like by rank percentiles
    """
    # Bootstrapping fallback: if 7d mean is missing, use today's edr_raw
    edr_7d_missing = "edr_7d_mean" not in latest.columns
    edr_7d_all_na = bool(latest["edr_7d_mean"].isna().all()) if not edr_7d_missing else True
    if edr_7d_missing or edr_7d_all_na:
        latest = latest.copy()
        edr_raw_series = cast(pd.Series, latest["edr_raw"]) if "edr_raw" in latest.columns else pd.Series([0.0] * len(latest), dtype=float)
        latest["edr_7d_mean"] = edr_raw_series
    # -- Higher is better: edr_7d_mean, edr_mom
    # -- Lower is better: edr_14d_vol

    n = len(latest)
    idx = latest.index

    # --- Level (revenue strength) ---
    edr_7d = (
        latest["edr_7d_mean"]
        if "edr_7d_mean" in latest.columns
        else pd.Series([pd.NA] * n, index=idx)
    )

    edr_raw = (
        latest["edr_raw"]
        if "edr_raw" in latest.columns
        else pd.Series([0.0] * n, index=idx)
    )

    level_series = edr_7d.fillna(edr_raw).astype(float)
    level = level_series.rank(pct=True)


    # --- Momentum ---
    if "edr_mom" in latest.columns:
        mom_series = latest["edr_mom"].astype(float)
    else:
        mom_series = pd.Series([0.0] * n, index=idx)

    mom = mom_series.fillna(0.0).rank(pct=True)


    # --- Risk (volatility penalty) ---
    if "edr_14d_vol" in latest.columns:
        risk_series = latest["edr_14d_vol"].astype(float)
    else:
        risk_series = pd.Series([0.0] * n, index=idx)

    risk = risk_series.fillna(0.0).rank(pct=True)


    # --- Final composite score ---
    score = 0.65 * level + 0.25 * mom - 0.10 * risk
    return score

def rebalance_weekly(features: pd.DataFrame, rebalance_date: str, params: RebalanceParams, prior_membership: Optional[pd.DataFrame] = None,) -> RebalanceResult:
    """
    features: output of compute_rolling_features(history) with time-series row.
    rebalance_date: 'YYYY-MM-DD'

    prior_membership: membership table from previous rebalance (Optional)
    """

    reb_date = pd.to_datetime(rebalance_date).normalize()

    # -- Use latest available row per universeId up to rebalance_date
    df = features.copy()
    df["snapshot_date"] = pd.to_datetime(df["snapshot_date"]).dt.normalize()
    df = cast(pd.DataFrame, df[df["snapshot_date"] <= reb_date])

    sorted_df = cast(pd.DataFrame, df.sort_values(by=["universeId", "snapshot_date"]))
    latest = cast(pd.DataFrame, sorted_df.groupby("universeId", as_index=False).tail(1))

    # -- Eligibility

    latest = cast(pd.DataFrame, latest[latest["coverage_7d"] >= params.min_coverage_7d].copy())
    if latest.empty:
        membership: pd.DataFrame = pd.DataFrame(columns=["rebalance_date", "universeId", "rank", "in_index", "weight"])  # type: ignore[arg-type]
        return RebalanceResult(membership=membership, ranked=latest)

    # -- Score & Rank
    latest["score"] = _score_v1(latest)
    latest = cast(pd.DataFrame, latest.sort_values("score", ascending=False).reset_index(drop=True))
    latest["rank"] = latest.index + 1

    # -- Determine current members using hysteresis
    prev_set = set()
    if prior_membership is not None and not prior_membership.empty:
        pm = prior_membership.copy()
        pm["rebalance_date"] = pd.to_datetime(pm["rebalance_date"]).dt.normalize()
        last_reb = pm["rebalance_date"].max()
        prev_set = set(pm.loc[pm["rebalance_date"] == last_reb].query("in_index == True")["universeId"].tolist())

    
    # -- Base selection by rank
    enter = set(latest.loc[latest["rank"] <= params.enter_rank, "universeId"].tolist())
    stay = set(latest.loc[latest["rank"] <= params.exit_rank, "universeId"].tolist())

    selected = list(enter | stay)

    # -- Fill to exactly n_constituents with next best ranks
    if len(selected) < params.n_constituents:
        fill = latest.loc[~latest["universeId"].isin(selected)].head(params.n_constituents - len(selected))["universeId"].tolist()
        selected.extend(fill)
    else:
        selected = latest.loc[latest["universeId"].isin(selected)].head(params.n_constituents)["universeId"].tolist()
    
    # -- Build membership frame
    latest["in_index"] = latest["universeId"].isin(selected)
    members = latest[latest["in_index"]].copy()

    # -- Simple weights: revenue-level proxy weights by edr_7d_mean

    edr_series = cast(pd.Series, members["edr_7d_mean"])
    denom = edr_series.clip(lower=0.0).sum()
    if denom > 0:
        members["weight"] = edr_series.clip(lower=0.0) / denom
    else:
        members["weight"] = 1.0 / len(members)
    
    membership = cast(pd.DataFrame, members[["universeId", "rank", "in_index", "weight"]].copy())
    membership.insert(0, "rebalance_date", reb_date.date())

    ranked = cast(pd.DataFrame, latest[["universeId", "snapshot_date", "score", "rank", "edr_7d_mean", "edr_mom", "edr_14d_vol", "coverage_7d"]].copy())
    return RebalanceResult(membership=membership, ranked=ranked)