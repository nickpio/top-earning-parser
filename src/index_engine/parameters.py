from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict

MODEL_VERSION = "2.0"


@dataclass(frozen=True)
class EDRParams:
    """
    Estimated Daily Revenue (EDR) model v2:

        EDR (Robux/day) = DAU * base_ARPDAU * monetization_intensity

    * DAU is scaled from concurrent players.
    * base_ARPDAU anchors the total spend of the tracked universe to Roblox's
      published developer-earnings aggregates.
    * monetization_intensity is inferred per experience from its position in
      Roblox's own Top-Earning chart: assuming revenue falls off with chart
      position as rank^-zipf_exponent, the intensity is the ratio between the
      chart-implied revenue and the audience-only estimate. It is smoothed over
      time (monetization design changes slowly) and bounded.

    Calibration notes: among the scraped fields only concurrent players carries
    real information about the chart ordering (Spearman ~0.62); game-pass count,
    price, like ratio, favourites and age add < 0.01 and are therefore not part
    of the formula (they are still exported for context).
    """

    # --- Audience -----------------------------------------------------------
    # Daily active users per unit of average concurrent users. Platform-wide
    # DAU / average CCU is ~9 and a user plays ~2 experiences per day.
    dau_per_ccu: float = 20.0

    # --- Monetization -------------------------------------------------------
    # Gross in-experience spend (Robux) per DAU per day for the tracked universe
    # as a whole, before per-experience intensity.
    base_arpdau_robux: float = 6.0

    # Revenue ~ chart_rank ** -zipf_exponent. 0.8 => #1 earns ~6x #10, ~40x #100.
    zipf_exponent: float = 0.8

    # Smoothing (observations) and bounds of the per-experience intensity.
    intensity_ema_span: int = 7
    intensity_bounds: tuple[float, float] = (0.05, 10.0)

    # --- Currency -----------------------------------------------------------
    developer_share: float = 0.70          # creator share of in-experience spend
    devex_usd_per_robux: float = 0.0038    # DevEx cash-out rate

    @property
    def robux_to_usd(self) -> float:
        return self.developer_share * self.devex_usd_per_robux


@dataclass(frozen=True)
class RollingParams:
    # Calendar-day windows (robust to missing days in the sample)
    mean_window_days: int = 7
    vol_window_days: int = 14
    vol_min_periods: int = 3

    # Observation-based EMAs used for the momentum ratio
    ema_fast: int = 7
    ema_slow: int = 30


@dataclass(frozen=True)
class RebalanceParams:
    # Hysteresis to reduce churn:
    # - non-members enter when rank <= enter_rank
    # - members stay while rank <= exit_rank
    enter_rank: int = 90
    exit_rank: int = 130

    # Eligibility
    max_staleness_days: int = 2           # latest snapshot must be this recent
    min_observations_7d: int = 2          # relaxed automatically while bootstrapping

    # Weighting
    n_constituents: int = 100
    max_weight: float = 0.10


@dataclass(frozen=True)
class IndexParams:
    base_level: float = 1000.0
    # Column of the smoothed EDR series the index tracks
    level_column: str = "edr_7d_mean"
    # The index starts on the first rebalance whose constituents have (median)
    # at least this many observations in the smoothing window, so a single
    # early scrape cannot define the base level.
    warmup_observations: int = 3
    # Days of per-constituent history exported for the dashboard
    history_days: int = 90


@dataclass(frozen=True)
class StorageParams:
    index_data_dir: str = "index_data"
    snapshots_file: str = "snapshots.parquet"
    features_file: str = "features.parquet"
    membership_file: str = "membership.parquet"


def params_to_dict(*objs: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for o in objs:
        out[type(o).__name__] = asdict(o)
    return out
