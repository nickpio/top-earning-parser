from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, List, Tuple, Union

import numpy as np
import pandas as pd

DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")

# Raw scrape fields persisted in the snapshot store. Everything derived from
# them is recomputed on each run so a model change re-prices all history.
RAW_COLUMNS: tuple[str, ...] = (
    "snapshot_date",
    "universeId",
    "name",
    "developer",
    "rootPlaceId",
    "ageDays",
    "players",
    "visits",
    "favorites",
    "likes",
    "dislikes",
    "paidAccess",
    "paidAccessPrice",
    "gamePassCount",
    "avgGamePassPrice",
    "top_earning_rank",
    "scraped_at",
)


def discover_pruned_run_files(runs_dir: Union[str, Path]) -> List[Tuple[str, Path]]:
    """
    Matches runs/YYYY-MM-DD/pruned/*.json and returns (snapshot_date, path) sorted by date.
    """
    runs_dir = Path(runs_dir)
    if not runs_dir.exists():
        return []

    files: List[Tuple[str, Path]] = []
    for fp in sorted(runs_dir.glob("*/pruned/*.json")):
        m = DATE_RE.search(fp.parent.parent.name) or DATE_RE.search(fp.name)
        if not m:
            continue
        files.append((m.group(1), fp))

    files.sort(key=lambda x: x[0])
    return files


# --------------------------------------------------------------------------- #
# Legacy chart-order recovery
# --------------------------------------------------------------------------- #
def recover_top_earning_rank(
    players: np.ndarray,
    page_bounds: tuple[int, int] = (60, 100),
    nominal_page: int = 82,
) -> np.ndarray:
    """
    Reconstruct Roblox Top-Earning positions from files written by the original
    scraper, whose depth-first payload scan emitted every ~80-item API page in
    reverse order (pages themselves stayed in order).

    Page boundaries are found by splitting the sequence into pages of plausible
    size such that, inside each page, concurrent players rise with row position
    (the signature of a reversed page); rows are then re-numbered accordingly.
    """
    n = len(players)
    if n == 0:
        return np.array([], dtype=int)
    lo, hi = page_bounds
    if n <= hi:
        return np.arange(n, 0, -1)

    y = np.log10(np.clip(players.astype(float), 1.0, None))
    idx = np.arange(n, dtype=float)
    cy = np.concatenate([[0.0], np.cumsum(y)])
    cy2 = np.concatenate([[0.0], np.cumsum(y * y)])
    cxy = np.concatenate([[0.0], np.cumsum(idx * y)])

    def seg_score(a: int, b: int) -> float:
        m = b - a
        sy = cy[b] - cy[a]
        sy2 = cy2[b] - cy2[a]
        sxy = (cxy[b] - cxy[a]) - a * sy
        sx = m * (m - 1) / 2.0
        sx2 = (m - 1) * m * (2 * m - 1) / 6.0
        var = (m * sx2 - sx * sx) * (m * sy2 - sy * sy)
        if var <= 0:
            return 0.0
        return (m * sxy - sx * sy) / np.sqrt(var) * m

    pages = max(1, int(round(n / nominal_page)))
    while pages * lo > n:
        pages -= 1
    while pages * hi < n:
        pages += 1

    neg = -1e18
    best = np.full((pages + 1, n + 1), neg)
    arg = np.zeros((pages + 1, n + 1), dtype=int)
    best[0][0] = 0.0
    for j in range(1, pages + 1):
        for i in range(j * lo, n + 1):
            for m in range(lo, min(hi, i) + 1):
                prev = best[j - 1][i - m]
                if prev <= neg / 2:
                    continue
                v = prev + seg_score(i - m, i)
                if v > best[j][i]:
                    best[j][i] = v
                    arg[j][i] = m

    cuts: List[Tuple[int, int]] = []
    i = n
    for j in range(pages, 0, -1):
        m = arg[j][i]
        cuts.append((i - m, i))
        i -= m
    cuts.reverse()

    rank = np.zeros(n, dtype=int)
    for a, b in cuts:
        rank[a:b] = a + np.arange(b - a, 0, -1)
    return rank


def load_pruned_file(path: Union[str, Path], snapshot_date: str) -> pd.DataFrame:
    """
    Supports list[dict], {"data": [...]} and dict[str, dict] shapes.

    Files written by the current scraper carry `topEarningRank`; older files
    have their chart order reconstructed (see recover_top_earning_rank).
    """
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        obj: Any = json.load(f)

    if isinstance(obj, dict) and isinstance(obj.get("data"), list):
        rows = obj["data"]
    elif isinstance(obj, dict) and all(isinstance(v, dict) for v in obj.values()):
        rows = list(obj.values())
    elif isinstance(obj, list):
        rows = obj
    else:
        raise ValueError(f"Unsupported JSON shape in {path}")

    df = pd.DataFrame(rows)
    df["snapshot_date"] = pd.to_datetime(snapshot_date).date().isoformat()

    if "universeId" not in df.columns:
        if "universe_id" in df.columns:
            df["universeId"] = df["universe_id"]
        elif "id" in df.columns:
            df["universeId"] = df["id"]

    if "topEarningRank" in df.columns:
        df["top_earning_rank"] = pd.to_numeric(df["topEarningRank"], errors="coerce")
    else:
        players = pd.to_numeric(df.get("players", pd.Series(0, index=df.index)), errors="coerce").fillna(0).to_numpy()
        df["top_earning_rank"] = recover_top_earning_rank(players)

    if "scrapedAt" in df.columns:
        df["scraped_at"] = df["scrapedAt"]

    keep = [c for c in RAW_COLUMNS if c in df.columns]
    return df.loc[:, keep].copy()
