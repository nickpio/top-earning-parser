from __future__ import annotations

from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd

from .parameters import IndexParams

INDEX_COLUMNS: List[str] = [
    "date",
    "index_level",
    "daily_return",
    "coverage",
    "n_constituents",
    "basket_edr",
    "basket_edr_daily",
    "basket_edr_usd",
]


def _inception_date(
    feats: pd.DataFrame,
    mem: pd.DataFrame,
    rebalance_dates: List[pd.Timestamp],
    warmup_observations: int,
) -> pd.Timestamp | None:
    """First rebalance whose constituents have enough smoothing-window observations."""
    if "obs_7d" not in feats.columns or warmup_observations <= 1:
        return rebalance_dates[0] if rebalance_dates else None
    obs = feats.set_index(["snapshot_date", "universeId"])["obs_7d"]
    for d in rebalance_dates:
        ids = mem.loc[mem["rebalance_date"] == d, "universeId"]
        keys = pd.MultiIndex.from_arrays([[d] * len(ids), ids])
        found = obs.reindex(keys).dropna()
        if len(found) > 0 and float(found.median()) >= warmup_observations:
            return d
    return None


def build_index_level_series(
    features: pd.DataFrame,
    membership_history: pd.DataFrame,
    params: IndexParams,
    robux_to_usd: float,
) -> pd.DataFrame:
    """
    Chain-linked, revenue-weighted index.

    At each rebalance every constituent receives a fixed number of "shares"
    so that the basket value equals the running level; between rebalances the
    level is the sum of shares x smoothed EDR. Constituents missing from a
    day's scrape carry their last known value forward (reported via coverage).
    """
    for col in ("snapshot_date", "universeId", params.level_column, "edr_raw", "edr_usd"):
        if col not in features.columns:
            raise ValueError(f"features missing required column: {col}")
    for col in ("rebalance_date", "universeId", "weight"):
        if col not in membership_history.columns:
            raise ValueError(f"membership_history missing required column: {col}")

    mem = membership_history.copy()
    mem["rebalance_date"] = pd.to_datetime(mem["rebalance_date"]).dt.normalize()
    if "in_index" in mem.columns:
        mem = mem[mem["in_index"].astype(bool)]
    mem = mem.drop_duplicates(["rebalance_date", "universeId"], keep="last")
    if mem.empty:
        raise ValueError("membership_history has no constituents")

    cols = ["snapshot_date", "universeId", params.level_column, "edr_raw", "edr_usd"]
    if "obs_7d" in features.columns:
        cols.append("obs_7d")
    feats = features.loc[:, cols].copy()
    feats["snapshot_date"] = pd.to_datetime(feats["snapshot_date"]).dt.normalize()

    rebalance_dates = sorted(mem["rebalance_date"].unique())
    first = _inception_date(feats, mem, rebalance_dates, params.warmup_observations)
    if first is None:
        return pd.DataFrame(columns=INDEX_COLUMNS)
    rebalance_dates = [d for d in rebalance_dates if d >= first]
    snapshot_dates = sorted(feats["snapshot_date"].unique())
    dates = sorted({d for d in snapshot_dates if d >= first} | set(rebalance_dates))

    level_pivot = feats.pivot_table(index="snapshot_date", columns="universeId", values=params.level_column, aggfunc="last")
    observed = level_pivot.notna().reindex(dates).fillna(False)
    level_vals = level_pivot.reindex(dates).ffill()
    daily_vals = (
        feats.pivot_table(index="snapshot_date", columns="universeId", values="edr_raw", aggfunc="last")
        .reindex(dates)
        .ffill()
    )

    weights_by_date: Dict[pd.Timestamp, pd.Series] = {
        d: g.set_index("universeId")["weight"].astype(float) for d, g in mem.groupby("rebalance_date")
    }

    rows: List[dict] = []
    shares: pd.Series | None = None
    level = float(params.base_level)
    prev_level: float | None = None

    for d in dates:
        vals = level_vals.loc[d]
        if shares is not None:
            held = shares.index
            v = vals.reindex(held).fillna(0.0)
            level = float((shares * v).sum())

        if d in weights_by_date:
            w = weights_by_date[d]
            v = vals.reindex(w.index)
            valid = v.notna() & (v > 0)
            w = w[valid] / float(w[valid].sum()) if valid.any() else w.iloc[0:0]
            shares = (w * level / v[valid]) if valid.any() else None

        if shares is None:
            continue

        held = shares.index
        v = vals.reindex(held).fillna(0.0)
        basket = float(v.sum())
        obs = observed.loc[d].reindex(held).fillna(False).astype(bool)
        value_now = float((shares * v).sum())
        coverage = float((shares[obs] * v[obs]).sum() / value_now) if value_now > 0 else 0.0

        rows.append(
            {
                "date": d.date().isoformat(),
                "index_level": level,
                "daily_return": (level / prev_level - 1.0) if prev_level else 0.0,
                "coverage": coverage,
                "n_constituents": int(len(held)),
                "basket_edr": basket,
                "basket_edr_daily": float(daily_vals.loc[d].reindex(held).fillna(0.0).sum()),
                "basket_edr_usd": basket * robux_to_usd,
            }
        )
        prev_level = level

    out = pd.DataFrame(rows, columns=INDEX_COLUMNS)
    out["daily_return"] = out["daily_return"].replace([np.inf, -np.inf], 0.0)
    return out


def write_index_level_exports(out: pd.DataFrame, exports_dir: str) -> None:
    out_dir = Path(exports_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / "rte100_index_level.csv"
    json_path = out_dir / "rte100_index_level.json"
    out.to_csv(csv_path, index=False)
    out.to_json(json_path, orient="records", indent=2)

    print(f"[index_engine] Index level CSV: {csv_path}")
    print(f"[index_engine] Index level JSON: {json_path}")
