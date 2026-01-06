from __future__ import annotations

import math
from typing import Any, List, cast

import pandas as pd

from .parameters import EDRParams


def _safe_div(a: pd.Series, b: pd.Series) -> pd.Series:
    b2 = b.replace({0: pd.NA})
    return (a / b2).fillna(0.0)


def _extract_prices(x: Any) -> List[float]:
    if not x or not isinstance(x, list):
        return []
    out: List[float] = []
    for it in x:
        if isinstance(it, dict) and it.get("price") is not None:
            try:
                out.append(float(it["price"]))
            except Exception:
                pass
    return out


def add_ccu(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "avg_ccu" in df.columns:
        df["avg_ccu"] = df["avg_ccu"].fillna(0).astype(float)
        return df
    for c in ("players", "playing", "ccu", "concurrentPlayers"):
        if c in df.columns:
            df["avg_ccu"] = df[c].fillna(0).astype(float)
            return df
    df["avg_ccu"] = 0.0
    return df


def add_monetization_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Monetization count
    if "monetization_count" not in df.columns:
        if "num_gamepasses" in df.columns or "num_devproducts" in df.columns:
            num_gp = df["num_gamepasses"].fillna(0).astype(float) if "num_gamepasses" in df.columns else pd.Series([0.0] * len(df))
            num_dp = df["num_devproducts"].fillna(0).astype(float) if "num_devproducts" in df.columns else pd.Series([0.0] * len(df))
            df["monetization_count"] = num_gp + num_dp
        else:
            gp = cast(pd.Series, df["game_passes"] if "game_passes" in df.columns else pd.Series([None] * len(df)))
            dp = cast(pd.Series, df["dev_products"] if "dev_products" in df.columns else pd.Series([None] * len(df)))
            df["monetization_count"] = gp.apply(lambda v: len(v) if isinstance(v, list) else 0) + dp.apply(
                lambda v: len(v) if isinstance(v, list) else 0
            )

    # Price surface
    gp_prices = cast(pd.Series, (df["game_passes"] if "game_passes" in df.columns else pd.Series([None] * len(df))).apply(_extract_prices))
    dp_prices = cast(pd.Series, (df["dev_products"] if "dev_products" in df.columns else pd.Series([None] * len(df))).apply(_extract_prices))
    all_prices = gp_prices + dp_prices

    def median(prices: List[float]) -> float:
        if not prices:
            return 0.0
        s = sorted(prices)
        mid = len(s) // 2
        return float(s[mid]) if len(s) % 2 == 1 else float((s[mid - 1] + s[mid]) / 2)

    def dispersion(prices: List[float]) -> float:
        if not prices:
            return 0.0
        m = sum(prices) / len(prices)
        if m <= 0:
            return 0.0
        var = sum((p - m) ** 2 for p in prices) / len(prices)
        return float(math.sqrt(var) / m)

    df["median_price"] = all_prices.apply(median)
    df["price_dispersion"] = all_prices.apply(dispersion)

    return df


def add_engagement_score(df: pd.DataFrame, params: EDRParams) -> pd.DataFrame:
    df = df.copy()

    visits = cast(pd.Series, df["visits"].fillna(0).astype(float) if "visits" in df.columns else pd.Series([0.0] * len(df), dtype=float))
    favorites = cast(pd.Series, df["favorites"].fillna(0).astype(float) if "favorites" in df.columns else pd.Series([0.0] * len(df), dtype=float))
    likes = cast(pd.Series, df["likes"].fillna(0).astype(float) if "likes" in df.columns else pd.Series([0.0] * len(df), dtype=float))

    fav_rate = _safe_div(favorites, visits)
    like_rate = _safe_div(likes, visits)

    raw = cast(pd.Series, 0.5 * (fav_rate + like_rate))
    df["engagement_score"] = (raw * params.engagement_scale).clip(0.0, params.engagement_cap)
    return df


def compute_edr_daily(df: pd.DataFrame, params: EDRParams) -> pd.DataFrame:
    """
    Computes daily EDR on a snapshot (one date).
    Output includes:
      dau_est, pcr, aspu, spend_revenue, premium_revenue, edr_raw
    """
    out = df.copy()
    out = add_ccu(out)
    out = add_monetization_features(out)
    out = add_engagement_score(out, params)

    out["dau_est"] = (params.alpha * out["avg_ccu"]).clip(lower=0.0)

    # PCR v1
    out["pcr"] = (
        params.base_rate * (1.0 + out["monetization_count"]).apply(lambda x: math.log(x))
    ).clip(lower=params.pcr_floor, upper=params.pcr_cap)

    # ASPU v1
    out["aspu"] = (out["median_price"] * (1.0 + out["price_dispersion"])).clip(lower=0.0)

    out["spend_revenue"] = out["dau_est"] * out["pcr"] * out["aspu"]
    out["premium_revenue"] = params.gamma * out["dau_est"] * out["engagement_score"]
    out["edr_raw"] = (out["spend_revenue"] + out["premium_revenue"]).clip(lower=0.0)

    return out