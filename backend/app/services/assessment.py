"""Glue between stored readings and the AI module; also derives alerts/proposals."""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ai.inference.schemas import AssessmentInput, Point
from ai.inference.service import assess as ai_assess
from ai.preprocessing.window import WINDOW_SIZE
from app.core.biomarkers import BIOMARKERS
from app.database.models import (Alert, BiomarkerReading, InterventionProposal, Patient,
                                 RiskAssessment, utcnow)


def run_assessment(db: Session, patient: Patient, as_of: Optional[datetime] = None) -> RiskAssessment:
    as_of = as_of or utcnow()
    series = {}
    for bid in BIOMARKERS:
        rows = (db.query(BiomarkerReading)
                .filter(BiomarkerReading.patient_id == patient.id, BiomarkerReading.biomarker_id == bid,
                        BiomarkerReading.measured_at <= as_of)
                .order_by(BiomarkerReading.measured_at.desc(), BiomarkerReading.id.desc())
                .limit(WINDOW_SIZE).all())
        series[bid] = [Point(ts=r.measured_at, value=r.value if r.quality == "ok" else None) for r in reversed(rows)]

    prev = (db.query(RiskAssessment)
            .filter(RiskAssessment.patient_id == patient.id, RiskAssessment.status == "ok")
            .order_by(RiskAssessment.computed_at.desc(), RiskAssessment.id.desc()).first())

    result = ai_assess(AssessmentInput(patient_id=patient.id, as_of=as_of, series=series))
    rec = RiskAssessment(
        patient_id=patient.id, category=result.category, category_key=result.category_key,
        status=result.status, source=result.source, model_version=result.model_version, computed_at=as_of,
        details=result.model_dump(mode="json", include={"reason", "contributions", "data_quality",
                                                         "explanation_key", "explanation_params"}),
    )
    db.add(rec)
    db.flush()

    if result.status == "ok" and result.category >= 2 and (prev is None or (prev.category or 0) < result.category):
        sev = "critical" if result.category == 3 else "warning"
        db.add(Alert(patient_id=patient.id, kind="risk", severity=sev,
                     message_key=f"alert.risk.{result.category_key}", params={"assessment_id": rec.id},
                     created_at=as_of))
        patient.review_status = "pending_review"
        has_pending = db.query(InterventionProposal).filter_by(patient_id=patient.id, status="pending").first()
        if not has_pending:
            db.add(InterventionProposal(patient_id=patient.id, assessment_id=rec.id, created_at=as_of))
    return rec
