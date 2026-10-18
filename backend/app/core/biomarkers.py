"""Centralised biomarker / vital-sign / sensor configuration (single source of truth).

Units are CONFIGURABLE (env UNIT_<ID>, e.g. UNIT_HS_CRP). Validation bounds are
technical plausibility limits used to reject corrupt input; they are NOT clinical
reference ranges. reference_range is None everywhere because none has been
specified for this project.
"""
import os
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class BiomarkerConfig:
    id: str
    names: dict
    abbreviation: str
    category: str
    default_unit: str
    sensor_kind: str
    min_valid: float
    max_valid: float
    color: str
    used_in_demo_rule: bool
    reference_range: Optional[tuple] = None

    @property
    def unit(self) -> str:
        return os.getenv(f"UNIT_{self.id.upper()}", self.default_unit)

    def public(self) -> dict:
        return {
            "id": self.id, "names": self.names, "abbreviation": self.abbreviation,
            "category": self.category, "unit": self.unit, "sensor_kind": self.sensor_kind,
            "validation": {"min": self.min_valid, "max": self.max_valid, "kind": "plausibility_only"},
            "reference_range": self.reference_range, "color": self.color,
            "used_in_demo_rule": self.used_in_demo_rule,
        }


BIOMARKERS: dict[str, BiomarkerConfig] = {b.id: b for b in [
    BiomarkerConfig("d_dimer", {"en": "D-dimer", "ar": "دي-دايمر", "ko": "D-다이머"}, "D-dimer",
                    "coagulation", "µg/mL", "wearable_patch", 0, 100, "#ff6b6b", True),
    BiomarkerConfig("tat", {"en": "Thrombin-Antithrombin complex", "ar": "معقد الثرومبين-مضاد الثرومبين",
                            "ko": "트롬빈-항트롬빈 복합체"}, "TAT", "coagulation", "µg/L", "wearable_patch",
                    0, 1000, "#f9a825", True),
    BiomarkerConfig("p_selectin", {"en": "Soluble P-selectin", "ar": "P-سيلكتين الذائب", "ko": "가용성 P-셀렉틴"},
                    "sP-selectin", "platelet_activation", "ng/mL", "wearable_patch", 0, 1000, "#8a74f9", True),
    BiomarkerConfig("hs_crp", {"en": "High-Sensitivity C-Reactive Protein", "ar": "بروتين سي التفاعلي عالي الحساسية",
                               "ko": "고감도 C-반응성 단백질"}, "hs-CRP", "inflammatory",
                    "mg/L", "electrochemical_aptasensor", 0, 500, "#10b981", False),
]}


@dataclass(frozen=True)
class VitalConfig:
    id: str
    names: dict
    unit: str
    sensor: str
    min_valid: float
    max_valid: float

    def public(self) -> dict:
        return {"id": self.id, "names": self.names, "unit": self.unit, "sensor": self.sensor,
                "validation": {"min": self.min_valid, "max": self.max_valid, "kind": "plausibility_only"}}


VITALS: dict[str, VitalConfig] = {v.id: v for v in [
    VitalConfig("heart_rate", {"en": "Heart rate", "ar": "معدل ضربات القلب", "ko": "심박수"}, "bpm", "MAX30102 (PPG)", 0, 300),
    VitalConfig("spo2", {"en": "Oxygen saturation (SpO₂)", "ar": "تشبع الأكسجين (SpO₂)", "ko": "산소포화도 (SpO₂)"}, "%", "MAX30102 (PPG)", 0, 100),
    VitalConfig("movement", {"en": "Movement / activity", "ar": "الحركة والنشاط", "ko": "움직임 및 활동"}, "a.u.", "MPU-6050 (IMU)", 0, 1000),
    VitalConfig("temperature", {"en": "Body temperature", "ar": "حرارة الجسم", "ko": "체온"}, "°C", "LM35", 20, 45),
]}

SENSORS = {
    "wearable_patch": {
        "names": {"en": "RAWA wearable patch", "ar": "رقعة رَواء القابلة للارتداء", "ko": "RAWA 웨어러블 패치"},
        "conceptual": True,
    },
    "electrochemical_aptasensor": {
        "names": {"en": "Electrochemical Aptasensor", "ar": "المستشعر الأبتامري الكهروكيميائي", "ko": "전기화학 압타센서"},
        "biomarker": "hs_crp",
        "conceptual": True,  # proposed sensing technology; NOT a validated physical device
    },
}
