from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.models import Patient, RiskAssessment
from app.schemas import AssessmentOut, PatientSummary


def ok(data: Any, meta: Optional[dict] = None) -> dict:
    return {"data": data, "error": None, "meta": meta}


def get_patient_or_404(db: Session, patient_id: str) -> Patient:
    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(404, f"Patient {patient_id} not found")
    return p


def latest_assessment(db: Session, patient_id: str) -> Optional[RiskAssessment]:
    return (db.query(RiskAssessment).filter_by(patient_id=patient_id)
            .order_by(RiskAssessment.computed_at.desc(), RiskAssessment.id.desc()).first())


def summarize(db: Session, p: Patient) -> PatientSummary:
    a = latest_assessment(db, p.id)
    last = max((d.last_reading_at for d in p.devices if d.last_reading_at), default=None)
    s = PatientSummary.model_validate(p)
    s.risk = AssessmentOut.model_validate(a) if a else None
    s.devices_connected = sum(1 for d in p.devices if d.status == "connected")
    s.devices_total = len(p.devices)
    s.last_update = last
    return s
