from __future__ import annotations

from pathlib import Path
from typing import List, Optional

import pandas as pd


def _fmt_pct(x: float, digits: int = 2) -> str:
    try:
        return f"{float(x) * 100.0:.{digits}f}%"
    except (TypeError, ValueError):
        return "—"


def _fmt_num(x: float, digits: int = 2) -> str:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return "—"
    if pd.isna(v):
        return "—"
    av = abs(v)
    if av >= 1_000_000_000:
        return f"{v / 1_000_000_000:.{digits}f}B"
    if av >= 1_000_000:
        return f"{v / 1_000_000:.{digits}f}M"
    if av >= 1_000:
        return f"{v / 1_000:.{digits}f}K"
    return f"{v:.{digits}f}"


def _fmt_change(x: object) -> str:
    if x is None or pd.isna(x):
        return "new"
    v = int(x)
    return f"+{v}" if v > 0 else str(v)


def _table(df: pd.DataFrame, cols: List[str], n: int) -> str:
    existing = [c for c in cols if c in df.columns]
    if not existing or df.empty:
        return "_(none)_"
    return df.loc[:, existing].head(n).to_markdown(index=False)


def write_rebalance_report(
    exports_dir: str,
    rebalance_date: str,
    constituents: pd.DataFrame,
    membership_history: Optional[pd.DataFrame],
    index_ts: Optional[pd.DataFrame],
    meta: Optional[dict],
    robux_to_usd: float,
) -> Path:
    out_dir = Path(exports_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = constituents.sort_values("rank").reset_index(drop=True)
    w = pd.to_numeric(df.get("weight", pd.Series(dtype=float)), errors="coerce").fillna(0.0)

    lines: List[str] = [f"# RTE100 Rebalance Report — {rebalance_date}", ""]

    lines += ["## Summary", ""]
    lines.append(f"- Constituents: **{len(df)}**")
    if "edr_7d_mean" in df.columns:
        basket = float(pd.to_numeric(df["edr_7d_mean"], errors="coerce").fillna(0.0).sum())
        lines.append(f"- Basket EDR (7d mean): **R$ {_fmt_num(basket)}/day** (≈ ${_fmt_num(basket * robux_to_usd)} developer earnings)")
    lines.append(f"- Top 5 concentration: **{_fmt_pct(w.head(5).sum())}**")
    lines.append(f"- Top 10 concentration: **{_fmt_pct(w.head(10).sum())}**")
    if index_ts is not None and not index_ts.empty:
        last = index_ts.iloc[-1]
        lines.append(f"- Index level: **{float(last['index_level']):.2f}** ({_fmt_pct(float(last['daily_return']))} vs prior observation)")
    v = (meta or {}).get("validation", {})
    if v.get("next_spearman_model") is not None:
        lines.append(
            f"- Predicting the next Top-Earning chart (Spearman, mean over {v['n_dates']} dates): "
            f"**{v['next_spearman_model']:+.3f}** model vs {v['next_spearman_ccu_only']:+.3f} CCU-only "
            f"vs {v['next_spearman_chart_persistence']:+.3f} chart persistence"
        )
    lines.append("")

    lines += ["## Top 10", ""]
    view = df.copy()
    if "weight" in view.columns:
        view["weight"] = w.map(lambda v: _fmt_pct(v))
    if "edr_7d_mean" in view.columns:
        view["EDR 7d (R$)"] = pd.to_numeric(view["edr_7d_mean"], errors="coerce").map(_fmt_num)
        view["EDR 7d ($)"] = (pd.to_numeric(view["edr_7d_mean"], errors="coerce") * robux_to_usd).map(_fmt_num)
    if "rank_change" in view.columns:
        view["change"] = view["rank_change"].map(_fmt_change)
    if "avg_ccu" in view.columns:
        view["CCU"] = pd.to_numeric(view["avg_ccu"], errors="coerce").map(lambda v: _fmt_num(v, 1))
    lines.append(_table(view, ["rank", "change", "name", "developer", "weight", "EDR 7d (R$)", "EDR 7d ($)", "CCU"], n=10))
    lines.append("")

    mh = membership_history.copy() if membership_history is not None else pd.DataFrame()
    if not mh.empty:
        mh["rebalance_date"] = pd.to_datetime(mh["rebalance_date"]).dt.date.astype(str)
        prior_dates = sorted(d for d in mh["rebalance_date"].unique() if d < rebalance_date)
        if prior_dates:
            prior_date = prior_dates[-1]
            prior = mh[mh["rebalance_date"] == prior_date]
            curr_ids = set(df["universeId"].tolist())
            prior_ids = set(prior["universeId"].tolist())

            lines += [f"## Changes vs {prior_date}", ""]
            entrants = df[df["universeId"].isin(curr_ids - prior_ids)].copy()
            if not entrants.empty and "weight" in entrants.columns:
                entrants["weight"] = pd.to_numeric(entrants["weight"], errors="coerce").map(_fmt_pct)
            lines += ["### New entrants", "", _table(entrants, ["rank", "name", "developer", "weight", "universeId"], n=25), ""]

            exits = prior[prior["universeId"].isin(prior_ids - curr_ids)].sort_values("rank").copy()
            if not exits.empty and "weight" in exits.columns:
                exits["weight"] = pd.to_numeric(exits["weight"], errors="coerce").map(_fmt_pct)
            lines += ["### Exits", "", _table(exits, ["rank", "universeId", "weight"], n=25), ""]

    lines += ["## Data quality", ""]
    for col in ("visits_per_day", "like_ratio", "avgGamePassPrice", "edr_7d_mean"):
        if col in df.columns:
            missing = int(pd.to_numeric(df[col], errors="coerce").isna().sum())
            lines.append(f"- Missing `{col}`: **{missing}/{len(df)}**")
    if "coverage_7d" in df.columns:
        cov = pd.to_numeric(df["coverage_7d"], errors="coerce").fillna(0.0)
        lines.append(f"- Mean 7-day coverage: **{_fmt_pct(float(cov.mean()), 1)}**")

    md = "\n".join(lines).strip() + "\n"
    report_path = out_dir / f"rte100_report_{rebalance_date}.md"
    report_path.write_text(md, encoding="utf-8")
    return report_path
