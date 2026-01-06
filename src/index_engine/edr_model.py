from __future__ import annotations

from ast import Pass
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import pandas as pd

# -- Parameters
@dataclass
class EDRParams:
    alpha: float = 20.0
    base_rate: float = 0.01
    gamma: float = 0.02

    pcr_floor: float = 0.001
    pcr_cap: float = 0.05

    engagement_scale: float = 50.0
    engagement_cap: float = 1.5

DATE_RE = re.compile(fr"(\d{4}-\d{2}-\d{2})")

# -- Run discovery
def discover_pruned_run_files(runs_dir: Union[str, Path]) -> List[Tuple[str, Path]]:

    runs_dir = Path(runs_dir)
    if not runs_dir.exists():
        raise FileNotFoundError(f"Runs dir not found: {runs_dir}")

    files: List[Tuple[str, Path]] = []

    for fp in runs_dir.glob("*/pruned/*.json"):
        parts = fp.parts
        m = DATE_RE.search(str(fp))
        if not m:
            continue
        date_str = m.group(1)
        files.append((date_str, fp))
    
    files.sort(key=lambda x: x[0])
    return files

def load_pruned_file(path: Path, snapshot_date: str) -> pd.DataFrame:



    with open(path, "r", encoding="utf-8") as f:
        obj = json.load(f)
    
    if isinstance(obj, dict) and "data" in obj and isinstance(obj["data"], list):
        rows = obj["data"]
    elif isinstance(obj, dict) and all(isinstance(v, dict) for v in obj.values()):
        rows = list(obj.values())
    elif isinstance(obj, list):
        rows = obj
    else:
        raise ValueError(f"Unsupported JSON shape in {path}")
    
    df = pd.DataFrame(rows)
    df["snapshot_date"] = pd.to_datetime(snapshot_date).date()

    if "universeId" not in df.columns:
        if "universe_id" in df.columns:
            df["universeId"] = df["universe_id"]
        elif "id" in df.columns:
            df["universeId"] = df["id"]
    
    return df

# -- Feature helpers

def _safe_div(a: pd.Series, b: pd.Series) -> pd.Series:
    b2 = b.replace({0: pd.NA})
    return (a / b2).fillna(0.0)

def _extract_prices(x: Any) -> List[float]:
    if not x or not isinstance(x, list):
        return []
    out = []
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

