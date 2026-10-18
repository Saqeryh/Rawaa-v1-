"""Windowing and validity helpers shared by every inference backend."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from ai.inference.schemas import Point

WINDOW_SIZE = 12  # most recent readings per biomarker considered


def prepare_window(points: list[Point], as_of: Optional[datetime] = None, window_size: int = WINDOW_SIZE) -> list[Point]:
    pts = sorted(points, key=lambda p: p.ts)
    if as_of is not None:
        pts = [p for p in pts if p.ts <= as_of]
    return pts[-window_size:]


def valid_values(window: list[Point]) -> list[float]:
    return [p.value for p in window if p.value is not None]
