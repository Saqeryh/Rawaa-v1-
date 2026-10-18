"""Deterministic SYNTHETIC data generator. Values are fictional and arbitrary."""
import random
from dataclasses import dataclass

CYCLE = 48  # scenario restarts after this many steps so live values stay bounded

BASELINES = {"d_dimer": 0.25, "tat": 1.2, "p_selectin": 30.0, "hs_crp": 1.0}
VITAL_BASE = {"heart_rate": 72.0, "spo2": 97.0, "movement": 40.0, "temperature": 36.8}
COAG = ("d_dimer", "tat", "p_selectin")


@dataclass(frozen=True)
class Scenario:
    growth: float = 0.0
    onset: int = 0
    missing_prob: float = 0.0


SCENARIOS = {
    "stable": Scenario(),
    "rising": Scenario(growth=0.03, onset=6),
    "pre_thrombotic": Scenario(growth=0.06, onset=8),
    "critical": Scenario(growth=0.10, onset=10),
    "missing_data": Scenario(missing_prob=0.35),
    "disconnected": Scenario(),
    "pending_review": Scenario(growth=0.04, onset=8),
}


def generate(scenario: str, step: int, seed_key: str, force_missing: bool = False):
    """Return (biomarkers, vitals): {id: (value|None, quality)} each."""
    cfg = SCENARIOS[scenario]
    rng = random.Random(f"{seed_key}:{step}")
    exp = max(0, (step % CYCLE) - cfg.onset)
    mult = (1 + cfg.growth) ** exp
    bio = {}
    for bid, base in BASELINES.items():
        factor = mult if bid in COAG else 1 + (mult - 1) * 0.8
        val = round(base * factor * (1 + rng.uniform(-0.02, 0.02)), 3)
        missing = force_missing or (rng.random() < cfg.missing_prob)
        bio[bid] = (None, "missing") if missing else (val, "ok")
    drift = min(exp * cfg.growth, 2.5)
    vit = {
        "heart_rate": (round(VITAL_BASE["heart_rate"] + drift * 8 + rng.uniform(-2, 2), 1), "ok"),
        "spo2": (round(VITAL_BASE["spo2"] - drift * 1.2 + rng.uniform(-0.3, 0.3), 1), "ok"),
        "movement": (round(VITAL_BASE["movement"] * (1 - min(0.5, drift * 0.2)) + rng.uniform(-3, 3), 1), "ok"),
        "temperature": (round(VITAL_BASE["temperature"] + rng.uniform(-0.1, 0.1), 2), "ok"),
    }
    return bio, vit
