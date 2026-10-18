"""Input/output schemas of the RAWA risk-assessment interface.

The same schemas are meant to be used by the demonstration rule engine and
by a future trained PyTorch LSTM, so the backend never depends on which one runs.
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

# Time-series features. hs-CRP is an inflammatory *supporting* feature.
BIOMARKER_FEATURES = ("d_dimer", "tat", "p_selectin", "hs_crp")
VITAL_FEATURES = ("heart_rate", "spo2", "movement", "temperature")  # used by the future LSTM only

# Four risk categories, ordered by index 0..3.
CATEGORY_KEYS = (
    "low_risk",
    "rising_activity",
    "pre_thrombotic_state",
    "critical_thrombosis_risk",
)

ResultSource = Literal["demonstration_rule", "synthetic_model", "trained_model"]


class Point(BaseModel):
    ts: datetime
    value: Optional[float] = None  # None == missing / unusable reading

    @field_validator("value")
    @classmethod
    def _valid_value(cls, v):
        if v is not None and (not math.isfinite(v) or v < 0):
            raise ValueError("value must be a finite non-negative number or null")
        return v


class AssessmentInput(BaseModel):
    patient_id: str = Field(min_length=1)
    as_of: datetime
    series: dict[str, list[Point]]

    @field_validator("series")
    @classmethod
    def _known_features(cls, v):
        unknown = set(v) - set(BIOMARKER_FEATURES)
        if unknown:
            raise ValueError(f"unknown biomarker ids: {sorted(unknown)}")
        return v


class Contribution(BaseModel):
    biomarker_id: str
    relative_change: Optional[float]  # (recent mean / reference mean) - 1
    used_in_rule: bool


class DataQuality(BaseModel):
    overall: Literal["ok", "degraded", "insufficient"]
    markers: dict[str, dict[str, int]]  # {biomarker: {valid_points, window_points}}


class AssessmentResult(BaseModel):
    status: Literal["ok", "insufficient_data"]
    category: Optional[int] = None  # 0..3, None if insufficient
    category_key: Optional[str] = None
    reason: Optional[Literal["no_data", "stale_data", "not_enough_data"]] = None
    source: ResultSource
    model_version: str
    computed_at: datetime
    contributions: list[Contribution] = []
    data_quality: DataQuality
    explanation_key: str
    explanation_params: dict = {}
    # NOTE: deliberately no confidence / accuracy / probability fields.
    # A demonstration rule has none, and none must be fabricated.
