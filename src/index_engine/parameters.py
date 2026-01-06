from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class EDRParams:
    # DAU ≈ alpha * AvgCCU
    alpha: float = 20.0

    # PCR = base_rate * log(1 + monetization_count)
    base_rate: float = 0.01  # 1%

    # Premium revenue proxy scaling
    gamma: float = 0.02

    # Conversion floors/caps
    pcr_floor: float = 0.001  # 0.1%
    pcr_cap: float = 0.05     # 5%

    # Engagement proxy scaling/cap
    engagement_scale: float = 50.0
    engagement_cap: float = 1.5


@dataclass(frozen=True)
class RollingParams:
    # Rolling windows (in days; daily sampling)
    mean_7d_min_periods: int = 3
    vol_14d_min_periods: int = 7

    ema_fast: int = 7
    ema_slow: int = 30


@dataclass(frozen=True)
class RebalanceParams:
    # Weekly rebalance weekday: Monday=0 ... Sunday=6
    rebalance_weekday: int = 0

    # Hysteresis to reduce churn:
    # - members stay unless rank > exit_rank
    # - non-members enter if rank < enter_rank
    enter_rank: int = 90
    exit_rank: int = 130

    # Minimum data coverage to be eligible at rebalance time
    min_coverage_7d: float = 0.0 # -- Temporary until 7d accumulated

    # Number of constituents
    n_constituents: int = 100


@dataclass(frozen=True)
class StorageParams:
    # Where derived data lives
    index_data_dir: str = "index_data"
    snapshots_file: str = "snapshots.parquet"
    features_file: str = "features.parquet"
    membership_file: str = "membership.parquet"