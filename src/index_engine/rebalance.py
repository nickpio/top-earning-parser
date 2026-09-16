from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Set

import pandas as pd

from .parameters import RebalanceParams

MEMBERSHIP_COLUMNS: List[str] = [
    "rebalance_date",
    "universeId",
    "rank",
    "prev_rank",
    "rank_change",
    "is_new",
    "in_index",
    "weight",
]


@dataclass(frozen=True)
class RebalanceResult:
    membership: pd.DataFrame  # one row per constituent (MEMBERSHIP_COLUMNS)
    ranked: pd.DataFrame      # every eligible experience with its rank and features


def cap_weights(weights: pd.Series, cap: float, max_iter: int = 50) -> pd.Series:
    """Cap weights at `cap`, redistributing the excess pro-rata to uncapped names."""
    w = weights.clip(lower=0.0)
    total = float(w.sum())
    if total <= 0 or len(w) == 0:
        return pd.Series(1.0 / max(len(w), 1), index=w.index, dtype="float64")
    w = w / total
    if cap * len(w) < 1.0:
        return pd.Series(1.0 / len(w), index=w.index, dtype="float64")

    for _ in range(max_iter):
        over = w > cap + 1e-12
        if not over.any():
            break
        excess = float((w[over] - cap).sum())
        w[over] = cap
        under = ~over
        pool = float(w[under].sum())
        if pool <= 0:
            break
        w[under] = w[under] + excess * (w[under] / pool)
    return w


def latest_members(prior_membership: Optional[pd.DataFrame]) -> pd.DataFrame:
    """Rows of the most recent rebalance in a membership history (empty if none)."""
    if prior_membership is None or prior_membership.empty:
        return pd.DataFrame(columns=MEMBERSHIP_COLUMNS)
    pm = prior_membership.copy()
    pm["rebalance_date"] = pd.to_datetime(pm["rebalance_date"]).dt.normalize()
    last = pm["rebalance_date"].max()
    pm = pm[pm["rebalance_date"] == last]
    if "in_index" in pm.columns:
        pm = pm[pm["in_index"].astype(bool)]
    return pm


def rebalance(
    features: pd.DataFrame,
    rebalance_date: str,
    params: RebalanceParams,
    prior_membership: Optional[pd.DataFrame] = None,
) -> RebalanceResult:
    """
    Select and weight constituents as of `rebalance_date`.

    Ranking is by trailing 7-day mean EDR (the stated purpose of the index);
    buffer rules keep existing members while they stay inside `exit_rank`.
    """
    reb_date = pd.to_datetime(rebalance_date).normalize()

    df = features.copy()
    df["snapshot_date"] = pd.to_datetime(df["snapshot_date"]).dt.normalize()
    df = df[df["snapshot_date"] <= reb_date]
    df = df.sort_values(["universeId", "snapshot_date"], kind="stable")
    latest = df.groupby("universeId", as_index=False, sort=False).tail(1).copy()

    staleness = (reb_date - latest["snapshot_date"]).dt.days
    fresh = latest[staleness <= params.max_staleness_days].copy()

    eligible = fresh[fresh["obs_7d"] >= params.min_observations_7d].copy()
    if len(eligible) < params.n_constituents:
        eligible = fresh  # bootstrap: not enough history yet

    if eligible.empty:
        return RebalanceResult(membership=pd.DataFrame(columns=MEMBERSHIP_COLUMNS), ranked=eligible)

    eligible = eligible.sort_values(["edr_7d_mean", "edr_raw"], ascending=[False, False], kind="stable")
    eligible = eligible.reset_index(drop=True)
    eligible["rank"] = eligible.index + 1

    prior = latest_members(prior_membership)
    prior_ids: Set[int] = set(prior["universeId"].tolist())
    prior_rank = dict(zip(prior["universeId"].tolist(), prior["rank"].tolist())) if not prior.empty else {}

    by_rank = eligible.sort_values("rank")
    stay: List[int] = [
        int(u) for u, r in zip(by_rank["universeId"], by_rank["rank"]) if u in prior_ids and r <= params.exit_rank
    ]
    forced: List[int] = [
        int(u) for u, r in zip(by_rank["universeId"], by_rank["rank"]) if u not in prior_ids and r <= params.enter_rank
    ]

    n = params.n_constituents
    room = n - len(stay)
    if len(forced) > room:
        drop = len(forced) - room
        stay = stay[: max(len(stay) - drop, 0)]
    selected: List[int] = stay + forced
    if len(selected) < n:
        chosen = set(selected)
        for u in by_rank["universeId"]:
            if len(selected) >= n:
                break
            if int(u) not in chosen:
                selected.append(int(u))
                chosen.add(int(u))
    selected = selected[:n]

    members = eligible[eligible["universeId"].isin(selected)].copy()
    members["weight"] = cap_weights(members["edr_7d_mean"].astype(float), params.max_weight).values
    members["prev_rank"] = members["universeId"].map(prior_rank)
    members["rank_change"] = members["prev_rank"] - members["rank"]
    members["is_new"] = ~members["universeId"].isin(list(prior_ids)) if prior_ids else False
    members["in_index"] = True
    members["rebalance_date"] = reb_date.date().isoformat()

    membership = members.loc[:, MEMBERSHIP_COLUMNS].sort_values("rank").reset_index(drop=True)
    ranked = eligible.copy()
    ranked["snapshot_date"] = ranked["snapshot_date"].dt.date.astype(str)
    return RebalanceResult(membership=membership, ranked=ranked)
