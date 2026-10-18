"""DEMONSTRATION rule engine -- NOT a trained model and NOT clinically validated.

It exists so the platform can show the full data flow
(sensor -> backend -> AI module -> dashboards) with the four agreed categories.
All numeric parameters below are arbitrary demo values chosen for the synthetic
scenarios. They are NOT medical thresholds and must never be presented as such.

Idea (mirrors the concept document's "rate of change" principle): compare the
recent mean of each coagulation marker with the reference mean at the start of
the window and count how many markers rise together.
hs-CRP is reported as a supporting contribution but is NOT used in the rule.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from statistics import mean

from ai.inference.schemas import (
    CATEGORY_KEYS, AssessmentInput, AssessmentResult, Contribution, DataQuality,
)
from ai.preprocessing.window import WINDOW_SIZE, prepare_window, valid_values

MODEL_VERSION = "demo-rule-v0"
RULE_MARKERS = ("d_dimer", "tat", "p_selectin")

DEMO_PARAMS = {  # ARBITRARY DEMO VALUES -- see module docstring
    "rising_rel_change": 0.15,
    "pre_thrombotic_rel_change": 0.50,
    "critical_rel_change": 1.00,
    "min_markers_meeting_tier": 2,
    "min_valid_points": 6,
    "reference_points": 3,
    "recent_points": 2,
    "stale_after_minutes": 180,
}


def _insufficient(inp: AssessmentInput, reason: str, quality: DataQuality, contributions=None) -> AssessmentResult:
    return AssessmentResult(
        status="insufficient_data", category=None, category_key=None, reason=reason,
        source="demonstration_rule", model_version=MODEL_VERSION, computed_at=inp.as_of,
        contributions=contributions or [], data_quality=quality,
        explanation_key="risk.explain.insufficient", explanation_params={"reason": reason},
    )


def classify(inp: AssessmentInput) -> AssessmentResult:
    p = DEMO_PARAMS
    quality_markers: dict[str, dict[str, int]] = {}
    rel_change: dict[str, float | None] = {}
    newest: datetime | None = None

    for bid in ("d_dimer", "tat", "p_selectin", "hs_crp"):
        window = prepare_window(inp.series.get(bid, []), inp.as_of, WINDOW_SIZE)
        vals = valid_values(window)
        quality_markers[bid] = {"valid_points": len(vals), "window_points": len(window)}
        rel_change[bid] = None
        if len(vals) >= p["min_valid_points"]:
            ref = mean(vals[: p["reference_points"]])
            cur = mean(vals[-p["recent_points"]:])
            if ref > 0:
                rel_change[bid] = cur / ref - 1
        if bid in RULE_MARKERS:
            for pt in window:
                if pt.value is not None and (newest is None or pt.ts > newest):
                    newest = pt.ts

    usable = [b for b in RULE_MARKERS if rel_change[b] is not None]
    overall = "ok" if len(usable) == len(RULE_MARKERS) else ("degraded" if len(usable) >= 2 else "insufficient")
    quality = DataQuality(overall=overall, markers=quality_markers)
    contributions = [
        Contribution(biomarker_id=b, relative_change=None if rel_change[b] is None else round(rel_change[b], 3),
                     used_in_rule=b in RULE_MARKERS)
        for b in ("d_dimer", "tat", "p_selectin", "hs_crp")
    ]

    if newest is None:
        return _insufficient(inp, "no_data", quality, contributions)
    if inp.as_of - newest > timedelta(minutes=p["stale_after_minutes"]):
        return _insufficient(inp, "stale_data", quality, contributions)
    if len(usable) < 2:
        return _insufficient(inp, "not_enough_data", quality, contributions)

    def n_at_least(t: float) -> int:
        return sum(1 for b in usable if rel_change[b] >= t)

    need = p["min_markers_meeting_tier"]
    if n_at_least(p["critical_rel_change"]) >= need:
        cat = 3
    elif n_at_least(p["pre_thrombotic_rel_change"]) >= need:
        cat = 2
    elif n_at_least(p["rising_rel_change"]) >= 1:
        cat = 1
    else:
        cat = 0
    key = CATEGORY_KEYS[cat]
    return AssessmentResult(
        status="ok", category=cat, category_key=key, source="demonstration_rule",
        model_version=MODEL_VERSION, computed_at=inp.as_of, contributions=contributions,
        data_quality=quality, explanation_key=f"risk.explain.{key}",
        explanation_params={"markers_used": usable},
    )
