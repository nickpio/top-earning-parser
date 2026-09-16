from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.index_engine.edr_model import compute_edr
from src.index_engine.index_level import build_index_level_series
from src.index_engine.io_runs import recover_top_earning_rank
from src.index_engine.parameters import EDRParams, IndexParams, RebalanceParams, RollingParams
from src.index_engine.rebalance import cap_weights, rebalance
from src.index_engine.rolling_features import compute_rolling_features


def _snapshot(date: str, rows: list[tuple[int, float, int, int]], scraped_at: str | None = None) -> pd.DataFrame:
    """rows: (universeId, players, visits, top_earning_rank)"""
    df = pd.DataFrame(rows, columns=["universeId", "players", "visits", "top_earning_rank"])
    df["snapshot_date"] = date
    df["likes"] = 90
    df["dislikes"] = 10
    if scraped_at:
        df["scraped_at"] = scraped_at
    return df


# --------------------------------------------------------------------------- #
# EDR model
# --------------------------------------------------------------------------- #
def test_edr_total_is_anchored_to_audience():
    params = EDRParams()
    snaps = _snapshot("2026-01-01", [(1, 1000, 10_000, 1), (2, 1000, 10_000, 2), (3, 100, 1_000, 3)])
    out = compute_edr(snaps, params)
    expected_total = params.dau_per_ccu * params.base_arpdau_robux * (1000 + 1000 + 100)
    assert out["edr_raw"].sum() == pytest.approx(expected_total)
    assert (out["edr_usd"] / out["edr_raw"]).dropna().iloc[0] == pytest.approx(params.robux_to_usd)


def test_better_chart_position_means_higher_edr_at_equal_audience():
    snaps = _snapshot("2026-01-01", [(1, 1000, 10_000, 1), (2, 1000, 10_000, 40)])
    out = compute_edr(snaps, EDRParams()).set_index("universeId")
    assert out.loc[1, "edr_raw"] > out.loc[2, "edr_raw"]
    assert out.loc[1, "intensity"] > 1 > out.loc[2, "intensity"]


def test_intensity_is_bounded_and_smoothed():
    params = EDRParams(intensity_bounds=(0.5, 2.0), intensity_ema_span=3)
    days = [
        _snapshot("2026-01-01", [(1, 10, 100, 1), (2, 100_000, 1_000_000, 2)]),
        _snapshot("2026-01-02", [(1, 10, 200, 1), (2, 100_000, 2_000_000, 2)]),
    ]
    out = compute_edr(pd.concat(days, ignore_index=True), params)
    assert out["intensity"].between(0.5, 2.0).all()
    # tiny audience at rank 1 sits on the upper bound, whale-sized audience at rank 2 on the lower one
    g = out.set_index(["universeId", "snapshot_date"])
    assert g.loc[(1, "2026-01-02"), "intensity"] == pytest.approx(2.0)
    assert g.loc[(2, "2026-01-02"), "intensity"] == pytest.approx(0.5)


def test_visits_per_day_uses_scrape_timestamps_when_available():
    days = [
        _snapshot("2026-01-01", [(1, 100, 1_000, 1)], scraped_at="2026-01-01T00:00:00Z"),
        _snapshot("2026-01-02", [(1, 100, 1_600, 1)], scraped_at="2026-01-02T12:00:00Z"),  # 36h later
    ]
    out = compute_edr(pd.concat(days, ignore_index=True), EDRParams())
    vpd = out.sort_values("snapshot_date")["visits_per_day"].tolist()
    assert np.isnan(vpd[0])
    assert vpd[1] == pytest.approx(600 / 36 * 24)
    assert out.sort_values("snapshot_date")["session_hours"].iloc[1] == pytest.approx(100 * 24 / (600 / 36 * 24))


# --------------------------------------------------------------------------- #
# Legacy chart-order recovery
# --------------------------------------------------------------------------- #
def test_recover_top_earning_rank_undoes_reversed_pages():
    rng = np.random.default_rng(7)
    n = 330
    true_rank = np.arange(1, n + 1)
    players = 500_000 * true_rank ** -1.1 * np.exp(rng.normal(0, 0.35, n))
    pages = [0, 85, 165, 250, n]
    stored_players = np.concatenate([players[a:b][::-1] for a, b in zip(pages[:-1], pages[1:])])
    stored_true = np.concatenate([true_rank[a:b][::-1] for a, b in zip(pages[:-1], pages[1:])])

    recovered = recover_top_earning_rank(stored_players)
    rho = pd.Series(recovered).corr(pd.Series(stored_true), method="spearman")
    assert rho > 0.98
    assert set(recovered) == set(range(1, n + 1))


def test_recover_top_earning_rank_single_page_is_exact_reversal():
    assert recover_top_earning_rank(np.array([1, 2, 3])).tolist() == [3, 2, 1]
    assert recover_top_earning_rank(np.array([])).tolist() == []


# --------------------------------------------------------------------------- #
# Rebalance
# --------------------------------------------------------------------------- #
def test_cap_weights_respects_cap_and_sums_to_one():
    w = cap_weights(pd.Series([80.0, 10.0, 5.0, 5.0]), cap=0.4)
    assert w.sum() == pytest.approx(1.0)
    assert w.max() <= 0.4 + 1e-9
    assert w.iloc[0] == pytest.approx(0.4)


def _features(date: str, n: int, stale_ids: set[int] = frozenset()) -> pd.DataFrame:
    rows = []
    for uid in range(1, n + 1):
        rows.append(
            {
                "universeId": uid,
                "snapshot_date": "2025-12-01" if uid in stale_ids else date,
                "edr_7d_mean": float(n - uid + 1) * 1000,
                "edr_raw": float(n - uid + 1) * 1000,
                "obs_7d": 5,
            }
        )
    return pd.DataFrame(rows)


def test_rebalance_applies_buffer_rules_and_staleness():
    params = RebalanceParams(n_constituents=5, enter_rank=4, exit_rank=7, max_weight=0.5)
    first = rebalance(_features("2026-01-01", 20), "2026-01-01", params)
    assert first.membership["universeId"].tolist() == [1, 2, 3, 4, 5]
    assert first.membership["weight"].sum() == pytest.approx(1.0)

    # Next day: game 5 slips to rank 6 (inside exit buffer) and game 6 rises to rank 5
    # (outside enter buffer) -> the incumbent keeps its seat.
    feats = _features("2026-01-02", 20)
    feats.loc[feats["universeId"] == 5, ["edr_7d_mean", "edr_raw"]] = 14_500.0  # between #6 (15k) and #7 (14k)
    second = rebalance(feats, "2026-01-02", params, prior_membership=first.membership)
    assert set(second.membership["universeId"]) == {1, 2, 3, 4, 5}
    row5 = second.membership.set_index("universeId").loc[5]
    assert row5["rank"] == 6 and row5["prev_rank"] == 5 and row5["rank_change"] == -1

    # Stale incumbents are dropped even if their old numbers look great.
    stale = rebalance(_features("2026-01-03", 20, stale_ids={1}), "2026-01-03", params, prior_membership=second.membership)
    assert 1 not in set(stale.membership["universeId"])
    assert stale.membership["is_new"].sum() == 1


# --------------------------------------------------------------------------- #
# Index level
# --------------------------------------------------------------------------- #
def test_index_level_is_continuous_and_carries_forward_missing_constituents():
    feats = pd.DataFrame(
        [
            ("2026-01-01", 1, 100.0), ("2026-01-01", 2, 100.0),
            ("2026-01-02", 1, 110.0), ("2026-01-02", 2, 90.0),
            ("2026-01-03", 1, 121.0),                          # game 2 missing -> carried forward
            ("2026-01-04", 1, 121.0), ("2026-01-04", 2, 90.0),
        ],
        columns=["snapshot_date", "universeId", "edr_7d_mean"],
    )
    feats["edr_raw"] = feats["edr_7d_mean"]
    feats["edr_usd"] = feats["edr_7d_mean"] * 0.5
    mem = pd.DataFrame(
        [
            ("2026-01-01", 1, 0.5), ("2026-01-01", 2, 0.5),
            ("2026-01-03", 1, 0.9), ("2026-01-03", 2, 0.1),   # rebalance with new weights
        ],
        columns=["rebalance_date", "universeId", "weight"],
    )
    out = build_index_level_series(feats, mem, IndexParams(warmup_observations=1), robux_to_usd=0.5)
    levels = out.set_index("date")["index_level"]
    assert levels["2026-01-01"] == pytest.approx(1000.0)
    assert levels["2026-01-02"] == pytest.approx(1000.0 * (0.5 * 1.1 + 0.5 * 0.9))
    # day 3: game 2 carried forward at 90 -> coverage below 1, level uses pre-rebalance shares
    day3 = out.set_index("date").loc["2026-01-03"]
    assert day3["index_level"] == pytest.approx(1000.0 * (0.5 * 1.21 + 0.5 * 0.9))
    assert day3["coverage"] < 1.0
    # day 4: unchanged values after the rebalance -> level unchanged (chain-linking is continuous)
    assert levels["2026-01-04"] == pytest.approx(day3["index_level"])
    assert out["basket_edr_usd"].iloc[-1] == pytest.approx(out["basket_edr"].iloc[-1] * 0.5)


def test_index_waits_for_warmup_observations():
    feats = pd.DataFrame(
        [("2026-01-01", 1, 100.0, 1), ("2026-01-02", 1, 100.0, 2), ("2026-01-03", 1, 100.0, 3)],
        columns=["snapshot_date", "universeId", "edr_7d_mean", "obs_7d"],
    )
    feats["edr_raw"] = feats["edr_7d_mean"]
    feats["edr_usd"] = feats["edr_7d_mean"]
    mem = pd.DataFrame([(d, 1, 1.0) for d in ("2026-01-01", "2026-01-02", "2026-01-03")], columns=["rebalance_date", "universeId", "weight"])
    out = build_index_level_series(feats, mem, IndexParams(warmup_observations=3), robux_to_usd=1.0)
    assert out["date"].tolist() == ["2026-01-03"]


# --------------------------------------------------------------------------- #
# Rolling features
# --------------------------------------------------------------------------- #
def test_rolling_features_use_calendar_windows():
    hist = pd.DataFrame(
        {
            "universeId": [1, 1, 1],
            "snapshot_date": ["2026-01-01", "2026-01-02", "2026-01-20"],
            "avg_ccu": [10.0, 20.0, 30.0],
            "edr_raw": [100.0, 200.0, 300.0],
            "edr_usd": [1.0, 2.0, 3.0],
        }
    )
    out = compute_rolling_features(hist, RollingParams()).set_index("snapshot_date")
    assert out.loc["2026-01-02", "obs_7d"] == 2
    assert out.loc["2026-01-02", "edr_7d_mean"] == pytest.approx(150.0)
    # 18 days later the window contains only the latest observation
    assert out.loc["2026-01-20", "obs_7d"] == 1
    assert out.loc["2026-01-20", "edr_7d_mean"] == pytest.approx(300.0)
    assert out.loc["2026-01-20", "coverage_7d"] == pytest.approx(1 / 7)
