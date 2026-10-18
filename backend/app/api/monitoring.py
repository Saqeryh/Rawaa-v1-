"""Alerts, simulated intervention workflow, dashboard, config, health."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.common import latest_assessment, ok, summarize
from app.api.deps import User, check_patient_access, get_user, require_doctor
from app.core.biomarkers import BIOMARKERS, SENSORS, VITALS
from app.core.config import get_settings
from app.database.db import get_db
from app.database.models import Alert, InterventionProposal, Patient, SimulationEvent, utcnow
from app.schemas import AlertOut, ProposalOut
from app.simulation.engine import log_event
from ai.inference.demo_rule import DEMO_PARAMS
from ai.inference.schemas import CATEGORY_KEYS

router = APIRouter(tags=["monitoring"])
DISCLAIMER = "DEMO DATA — SYNTHETIC PATIENTS — NOT FOR CLINICAL USE"


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(__import__("sqlalchemy").text("SELECT 1"))
    return ok({"status": "ok", "environment": get_settings().environment, "auth_mode": get_settings().auth_mode,
               "notice": DISCLAIMER})


@router.get("/config")
def config():
    """Public, non-secret configuration shared by both frontends (single source of truth)."""
    return ok({
        "biomarkers": [b.public() for b in BIOMARKERS.values()],
        "vitals": [v.public() for v in VITALS.values()],
        "sensors": SENSORS, "risk_categories": list(CATEGORY_KEYS),
        "risk_source": {"kind": "demonstration_rule", "params": DEMO_PARAMS,
                        "warning": "Arbitrary demo parameters. Not medical thresholds. Not a trained model."},
        "notice": DISCLAIMER,
    })


@router.get("/dev/tokens")
def dev_tokens(db: Session = Depends(get_db)):
    """DEV ONLY: lets the demo UIs sign in without an identity provider."""
    s = get_settings()
    if s.auth_mode != "dev" or s.environment == "production":
        raise HTTPException(404, "Not available")
    return ok({"doctor": s.dev_doctor_token,
               "patients": {p.id: f"dev-patient-{p.id}-token" for p in db.query(Patient).all()},
               "warning": "Development tokens. Not for production."})


@router.get("/alerts")
def list_alerts(patient_id: Optional[str] = None, status: Optional[str] = None, limit: int = 100,
                db: Session = Depends(get_db), user: User = Depends(get_user)):
    if user.role == "patient":
        patient_id = user.patient_id  # patients only ever see their own alerts
    q = db.query(Alert)
    if patient_id:
        q = q.filter(Alert.patient_id == patient_id)
    if status:
        q = q.filter(Alert.status == status)
    rows = q.order_by(Alert.created_at.desc(), Alert.id.desc()).limit(max(1, min(limit, 500))).all()
    return ok([AlertOut.model_validate(a).model_dump(mode="json") for a in rows])


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge(alert_id: int, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "Alert not found")
    if a.status == "acknowledged":
        raise HTTPException(409, "Alert already acknowledged")
    a.status, a.acknowledged_by, a.acknowledged_at = "acknowledged", user.id, utcnow()
    log_event(db, "alert_acknowledged", a.patient_id, f"alert={a.id}")
    db.commit()
    return ok(AlertOut.model_validate(a).model_dump(mode="json"))


# ---- simulated intervention workflow (no dose, no drug, no device control) ----
@router.get("/patients/{patient_id}/intervention-proposals")
def list_proposals(patient_id: str, db: Session = Depends(get_db), user: User = Depends(get_user)):
    check_patient_access(patient_id, user)
    rows = db.query(InterventionProposal).filter_by(patient_id=patient_id).order_by(InterventionProposal.created_at.desc(), InterventionProposal.id.desc()).all()
    return ok([ProposalOut.model_validate(r).model_dump(mode="json") for r in rows],
              {"notice": "SIMULATED workflow. Nothing is ever administered. No dose information exists in this system."})


def _resolve(proposal_id: int, status: str, db: Session, user: User):
    pr = db.get(InterventionProposal, proposal_id)
    if not pr:
        raise HTTPException(404, "Proposal not found")
    check_patient_access(pr.patient_id, user)
    if pr.status != "pending":
        raise HTTPException(409, f"Proposal already {pr.status}")
    pr.status, pr.resolved_at, pr.resolved_by = status, utcnow(), user.id
    log_event(db, f"simulated_proposal_{status}", pr.patient_id, f"proposal={pr.id} by={user.role}")
    db.commit()
    return ok(ProposalOut.model_validate(pr).model_dump(mode="json"),
              {"notice": "Simulated acknowledgement only. No treatment was administered."})


@router.post("/intervention-proposals/{proposal_id}/confirm")
def confirm(proposal_id: int, db: Session = Depends(get_db), user: User = Depends(get_user)):
    return _resolve(proposal_id, "confirmed", db, user)


@router.post("/intervention-proposals/{proposal_id}/cancel")
def cancel(proposal_id: int, db: Session = Depends(get_db), user: User = Depends(get_user)):
    return _resolve(proposal_id, "cancelled", db, user)


@router.get("/dashboard/summary")
def dashboard(db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    patients = db.query(Patient).all()
    items = [summarize(db, p) for p in patients]
    by_risk = {k: 0 for k in CATEGORY_KEYS}
    by_risk["insufficient_data"] = 0
    for i in items:
        if i.risk and i.risk.status == "ok":
            by_risk[i.risk.category_key] += 1
        else:
            by_risk["insufficient_data"] += 1
    trends = {}
    for bid in BIOMARKERS:
        changes = []
        for i in items:
            if i.risk:
                for c in i.risk.details.get("contributions", []):
                    if c["biomarker_id"] == bid and c["relative_change"] is not None:
                        changes.append(c["relative_change"])
        trends[bid] = {"patients_with_data": len(changes),
                       "patients_rising": sum(1 for c in changes if c >= DEMO_PARAMS["rising_rel_change"])}
    recent_alerts = db.query(Alert).order_by(Alert.created_at.desc(), Alert.id.desc()).limit(8).all()
    recent_updates = sorted([i for i in items if i.last_update], key=lambda i: i.last_update, reverse=True)[:5]
    return ok({
        "total_patients": len(items), "by_risk": by_risk,
        "needs_review": sum(1 for i in items if i.review_status == "pending_review"),
        "devices": {"connected": sum(i.devices_connected for i in items),
                    "total": sum(i.devices_total for i in items)},
        "open_alerts": db.query(Alert).filter_by(status="open").count(),
        "recent_alerts": [AlertOut.model_validate(a).model_dump(mode="json") for a in recent_alerts],
        "recent_updates": [{"patient_id": i.id, "display_name": i.display_name,
                            "last_update": i.last_update.isoformat() + "Z"} for i in recent_updates],
        "biomarker_trends": trends,
        "notice": DISCLAIMER,
    })
