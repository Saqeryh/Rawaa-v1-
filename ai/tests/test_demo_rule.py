from datetime import datetime, timedelta

import pytest
from pydantic import ValidationError

from ai.inference.schemas import AssessmentInput, CATEGORY_KEYS, Point
from ai.inference.service import ModelNotAvailableError, assess

NOW = datetime(2026, 1, 1, 12, 0)


def series(growth, n=12, missing=()):
    out = {}
    for b in ("d_dimer", "tat", "p_selectin", "hs_crp"):
        pts = []
        for i in range(n):
            ts = NOW - timedelta(hours=n - 1 - i)
            v = None if (b in missing and i % 2 == 0) else 1.0 * (1 + growth) ** i
            pts.append(Point(ts=ts, value=v))
        out[b] = pts
    return out


def run(growth, **kw):
    return assess(AssessmentInput(patient_id="P-1", as_of=NOW, series=series(growth, **kw)))


@pytest.mark.parametrize("growth,cat", [(0.0, 0), (0.03, 1), (0.06, 2), (0.10, 3)])
def test_four_categories(growth, cat):
    r = run(growth)
    assert r.status == "ok" and r.category == cat and r.category_key == CATEGORY_KEYS[cat]
    assert r.source == "demonstration_rule"


def test_result_has_no_fabricated_metrics():
    r = run(0.03).model_dump()
    for forbidden in ("confidence", "accuracy", "sensitivity", "specificity", "probability"):
        assert forbidden not in r


def test_hs_crp_reported_but_not_used_in_rule():
    r = run(0.03)
    crp = [c for c in r.contributions if c.biomarker_id == "hs_crp"][0]
    assert crp.used_in_rule is False


def test_insufficient_when_few_points():
    r = run(0.1, n=4)
    assert r.status == "insufficient_data" and r.category is None


def test_insufficient_when_no_data():
    r = assess(AssessmentInput(patient_id="P-1", as_of=NOW, series={}))
    assert r.status == "insufficient_data" and r.reason == "no_data"


def test_stale_data():
    r = assess(AssessmentInput(patient_id="P-1", as_of=NOW + timedelta(hours=10), series=series(0.1)))
    assert r.reason == "stale_data"


def test_missing_values_degrade_quality():
    r = run(0.03, missing=("d_dimer",))
    assert r.data_quality.markers["d_dimer"]["valid_points"] < 12


@pytest.mark.parametrize("bad", [-1.0, float("nan"), float("inf")])
def test_invalid_values_rejected(bad):
    with pytest.raises(ValidationError):
        Point(ts=NOW, value=bad)


def test_unknown_biomarker_rejected():
    with pytest.raises(ValidationError):
        AssessmentInput(patient_id="P-1", as_of=NOW, series={"glucose": []})


def test_lstm_backend_not_available():
    with pytest.raises(ModelNotAvailableError):
        assess(AssessmentInput(patient_id="P-1", as_of=NOW, series={}), backend="lstm")


def test_lstm_skeleton_shape():
    torch = pytest.importorskip("torch")
    from ai.training.lstm_model import ThrombiXLSTM
    out = ThrombiXLSTM()(torch.zeros(2, 12, 8))
    assert out.shape == (2, 4)
