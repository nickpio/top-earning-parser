from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple, Union

import pandas as pd

DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")


def discover_pruned_run_files(runs_dir: Union[str, Path]) -> List[Tuple[str, Path]]:
    """
    Matches your structure:
      runs/YYYY-MM-DD/pruned/YYYY-MM-DD_top-earning_top1500_enriched_pruned.json

    Returns list of (snapshot_date_str, filepath) sorted by date.
    """
    runs_dir = Path(runs_dir)
    if not runs_dir.exists():
        raise FileNotFoundError(f"Runs dir not found: {runs_dir}")

    files: List[Tuple[str, Path]] = []
    for fp in runs_dir.glob("*/pruned/*.json"):
        m = DATE_RE.search(str(fp))
        if not m:
            continue
        files.append((m.group(1), fp))

    files.sort(key=lambda x: x[0])
    return files


def load_pruned_file(path: Union[str, Path], snapshot_date: str) -> pd.DataFrame:
    """
    Supports:
      - list[dict]
      - {"data": [...]}
      - dict[str, dict] keyed by id
    """
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        obj: Any = json.load(f)

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

    # Normalize IDs
    if "universeId" not in df.columns:
        if "universe_id" in df.columns:
            df["universeId"] = df["universe_id"]
        elif "id" in df.columns:
            df["universeId"] = df["id"]

    return df