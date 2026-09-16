from __future__ import annotations

from typing import List, Optional

import pandas as pd

AGREEMENT_COLUMNS = [
    "snapshot_date",
    "n",
    "spearman_model",
    "spearman_ccu_only",
    "next_date",
    "n_next",
    "next_spearman_model",
    "next_spearman_ccu_only",
    "next_spearman_chart_persistence",
]


def _spearman(a: pd.Series, b: pd.Series) -> Optional[float]:
    if len(a) < 3:
        return None
    v = a.corr(b, method="spearman")
    return None if pd.isna(v) else float(v)


def top_earning_agreement(snapshots: pd.DataFrame, min_rows: int = 20) -> pd.DataFrame:
    """
    How well the model orders experiences compared with Roblox's Top-Earning chart.

    Same-day columns compare each day's estimate with that day's chart position
    (rank 1 = highest earning, so agreement is negative; -1 is perfect). Because
    the chart is an input to the model, the honest test is predictive: the
    `next_*` columns use today's estimate to predict the *next* snapshot's chart
    position, against the CCU-only baseline and pure chart persistence.
    """
    needed = {"snapshot_date", "universeId", "top_earning_rank", "edr_raw", "avg_ccu"}
    if snapshots.empty or not needed.issubset(snapshots.columns):
        return pd.DataFrame(columns=AGREEMENT_COLUMNS)

    df = snapshots.dropna(subset=["top_earning_rank", "edr_raw"]).copy()
    df["snapshot_date"] = df["snapshot_date"].astype(str)
    dates = sorted(df["snapshot_date"].unique())
    by_date = {d: g for d, g in df.groupby("snapshot_date")}

    rows: List[dict] = []
    for i, d in enumerate(dates):
        g = by_date[d]
        if len(g) < min_rows:
            continue
        row = {
            "snapshot_date": d,
            "n": int(len(g)),
            "spearman_model": _spearman(g["edr_raw"], g["top_earning_rank"]),
            "spearman_ccu_only": _spearman(g["avg_ccu"], g["top_earning_rank"]),
            "next_date": None,
            "n_next": 0,
            "next_spearman_model": None,
            "next_spearman_ccu_only": None,
            "next_spearman_chart_persistence": None,
        }
        if i + 1 < len(dates):
            nxt = by_date[dates[i + 1]]
            m = g.merge(nxt.loc[:, ["universeId", "top_earning_rank"]], on="universeId", suffixes=("", "_next"))
            if len(m) >= min_rows:
                row.update(
                    {
                        "next_date": dates[i + 1],
                        "n_next": int(len(m)),
                        "next_spearman_model": _spearman(m["edr_raw"], m["top_earning_rank_next"]),
                        "next_spearman_ccu_only": _spearman(m["avg_ccu"], m["top_earning_rank_next"]),
                        "next_spearman_chart_persistence": _spearman(m["top_earning_rank"], m["top_earning_rank_next"]),
                    }
                )
        rows.append(row)
    return pd.DataFrame(rows, columns=AGREEMENT_COLUMNS)


def format_agreement(agreement: pd.DataFrame) -> str:
    if agreement.empty:
        return "No dates with Top-Earning ranks available."

    def f(v: object) -> str:
        return "   —  " if v is None or pd.isna(v) else f"{float(v):+.3f}"

    lines = [
        "                   same-day vs chart        predicts next chart position",
        "date          n    model    ccu     |   model    ccu    persistence",
    ]
    for r in agreement.itertuples(index=False):
        lines.append(
            f"{r.snapshot_date}  {r.n:4d}  {f(r.spearman_model)}  {f(r.spearman_ccu_only)}  |  "
            f"{f(r.next_spearman_model)}  {f(r.next_spearman_ccu_only)}  {f(r.next_spearman_chart_persistence)}"
        )
    mean = agreement.drop(columns=["snapshot_date", "next_date"]).mean(numeric_only=True)
    lines.append(
        f"mean               {f(mean['spearman_model'])}  {f(mean['spearman_ccu_only'])}  |  "
        f"{f(mean['next_spearman_model'])}  {f(mean['next_spearman_ccu_only'])}  {f(mean['next_spearman_chart_persistence'])}"
    )
    return "\n".join(lines)
