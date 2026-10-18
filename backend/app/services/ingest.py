"""Validated storage of readings. One path for seed, simulator and manual API input."""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.biomarkers import BIOMARKERS, VITALS
from app.database.models import BiomarkerReading, Device, VitalSign


class ValidationFailure(ValueError):
    pass


def store_biomarker(db: Session, patient_id: str, biomarker_id: str, value: Optional[float],
                    measured_at: datetime, source: str, quality: str = "ok",
                    device_id: Optional[int] = None, unit: Optional[str] = None) -> BiomarkerReading:
    cfg = BIOMARKERS.get(biomarker_id)
    if cfg is None:
        raise ValidationFailure(f"unknown biomarker '{biomarker_id}'")
    if unit is not None and unit != cfg.unit:
        raise ValidationFailure(f"unit for {biomarker_id} must be '{cfg.unit}' (got '{unit}')")
    if value is None:
        quality = "missing"
    else:
        if quality == "missing":
            raise ValidationFailure("quality 'missing' requires value=null")
        if not (cfg.min_valid <= value <= cfg.max_valid):
            raise ValidationFailure(f"{biomarker_id} value {value} outside plausibility bounds [{cfg.min_valid}, {cfg.max_valid}]")
    row = BiomarkerReading(patient_id=patient_id, biomarker_id=biomarker_id, value=value, unit=cfg.unit,
                           measured_at=measured_at, source=source, quality=quality, device_id=device_id)
    db.add(row)
    return row


def store_vital(db: Session, patient_id: str, kind: str, value: Optional[float], measured_at: datetime,
                source: str, quality: str = "ok", device_id: Optional[int] = None) -> VitalSign:
    cfg = VITALS.get(kind)
    if cfg is None:
        raise ValidationFailure(f"unknown vital '{kind}'")
    if value is None:
        quality = "missing"
    elif not (cfg.min_valid <= value <= cfg.max_valid):
        raise ValidationFailure(f"{kind} value {value} outside plausibility bounds")
    row = VitalSign(patient_id=patient_id, kind=kind, value=value, unit=cfg.unit, measured_at=measured_at,
                    source=source, quality=quality, device_id=device_id)
    db.add(row)
    return row


def touch_device(db: Session, device: Device, ts: datetime):
    device.last_reading_at = ts
