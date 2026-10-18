"""Single entry point used by the backend. Backends are swappable."""
from __future__ import annotations

from ai.inference import demo_rule
from ai.inference.schemas import AssessmentInput, AssessmentResult


class ModelNotAvailableError(RuntimeError):
    pass


def assess(inp: AssessmentInput, backend: str = "demo_rule") -> AssessmentResult:
    if backend == "demo_rule":
        return demo_rule.classify(inp)
    if backend == "lstm":
        raise ModelNotAvailableError(
            "No trained LSTM exists. A validated dataset and training run are required "
            "(see docs/limitations.md and ai/training/lstm_model.py)."
        )
    raise ValueError(f"unknown backend: {backend}")
