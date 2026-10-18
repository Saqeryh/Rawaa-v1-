from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.common import get_patient_or_404, latest_assessment, ok, summarize
from app.api.deps import User, check_patient_access, get_user, require_doctor
from app.core.biomarkers import BIOMARKERS, SENSORS
from app.database.db import get_db
from app.database.models import (Alert, BiomarkerReading, ClinicalNote, Device, DeviceStatusLog,
                                 Patient, RiskAssessment, UserPreference, VitalSign, utcnow)
from app.schemas import (AlertOut, AssessmentOut, DeviceOut, NoteCreate, NoteOut, PatientCreate, PatientUpdate,
                         PreferencesUpdate, ReadingCreate, ReadingOut, VitalOut, _iso)
from app.services.assessment import run_assessment
from app.services.ingest import ValidationFailure, store_biomarker

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("")
def list_patients(search: Optional[str] = None, risk: Optional[str] = None, monitoring_status: Optional[str] = None,
                  sort: str = Query("id", pattern="^(id|name|risk|last_update)$"),
                  order: str = Query("asc", pattern="^(asc|desc)$"),
                  db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    q = db.query(Patient)
    if search:
        like = f"%{search.lower()}%"
        from sqlalchemy import func, or_
        q = q.filter(or_(func.lower(Patient.display_name).like(like), func.lower(Patient.id).like(like)))
    if monitoring_status:
        q = q.filter(Patient.monitoring_status == monitoring_status)
    items = [summarize(db, p) for p in q.all()]
    if risk:
        if risk == "insufficient_data":
            items = [i for i in items if i.risk and i.risk.status == "insufficient_data"]
        else:
            items = [i for i in items if i.risk and i.risk.category_key == risk]
    keyf = {
        "id": lambda i: i.id, "name": lambda i: i.display_name.lower(),
        "risk": lambda i: (i.risk.category if i.risk and i.risk.category is not None else -1),
        "last_update": lambda i: _iso(i.last_update) if i.last_update else "",
    }[sort]
    items.sort(key=keyf, reverse=(order == "desc"))
    return ok([i.model_dump(mode="json") for i in items], {"count": len(items)})


@router.post("", status_code=201)
def create_patient(body: PatientCreate, db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    nums = [int(p.id.split("-")[1]) for p in db.query(Patient).all() if p.id.startswith("P-") and p.id[2:].isdigit()]
    pid = f"P-{(max(nums) + 1) if nums else 1001}"
    p = Patient(id=pid, display_name=body.display_name, age=body.age, clinical_context=body.clinical_context,
                scenario=body.scenario)
    db.add(p)
    db.add(UserPreference(patient_id=pid))
    for kind in ("wearable_patch", "electrochemical_aptasensor"):
        db.add(Device(patient=p, kind=kind, name=SENSORS[kind]["names"]["en"], status="connected", conceptual=True))
    db.flush()
    for d in p.devices:
        db.add(DeviceStatusLog(device_id=d.id, status="connected"))
    db.commit()
    return ok(summarize(db, p).model_dump(mode="json"))


@router.get("/{patient_id}")
def patient_detail(patient_id: str, db: Session = Depends(get_db), user: User = Depends(get_user)):
    check_patient_access(patient_id, user)
    p = get_patient_or_404(db, patient_id)
    latest_bio = {}
    for bid in BIOMARKERS:
        r = (db.query(BiomarkerReading).filter_by(patient_id=p.id, biomarker_id=bid)
             .order_by(BiomarkerReading.measured_at.desc(), BiomarkerReading.id.desc()).first())
        if r:
            latest_bio[bid] = ReadingOut.model_validate(r).model_dump(mode="json")
    latest_vit = {}
    for kind in ("heart_rate", "spo2", "movement", "temperature"):
        r = (db.query(VitalSign).filter_by(patient_id=p.id, kind=kind)
             .order_by(VitalSign.measured_at.desc(), VitalSign.id.desc()).first())
        if r:
            latest_vit[kind] = VitalOut.model_validate(r).model_dump(mode="json")
    alerts = (db.query(Alert).filter_by(patient_id=p.id).order_by(Alert.created_at.desc(), Alert.id.desc()).limit(10).all())
    data = summarize(db, p).model_dump(mode="json")
    data.update({
        "devices": [DeviceOut.model_validate(d).model_dump(mode="json") for d in p.devices],
        "latest_biomarkers": latest_bio, "latest_vitals": latest_vit,
        "recent_alerts": [AlertOut.model_validate(a).model_dump(mode="json") for a in alerts],
        "data_notice": "DEMO DATA — SYNTHETIC PATIENTS — NOT FOR CLINICAL USE",
    })
    return ok(data)


@router.patch("/{patient_id}")
def update_patient(patient_id: str, body: PatientUpdate, db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    p = get_patient_or_404(db, patient_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None and k in ("display_name", "monitoring_status"):
            raise HTTPException(422, f"{k} cannot be null")
        setattr(p, k, v)
    db.commit()
    return ok(summarize(db, p).model_dump(mode="json"))


@router.get("/{patient_id}/biomarkers/{biomarker_id}/history")
def biomarker_history(patient_id: str, biomarker_id: str, limit: int = Query(100, ge=1, le=1000),
                      since_hours: Optional[int] = Query(None, ge=1, le=24 * 30),
                      db: Session = Depends(get_db), user: User = Depends(get_user)):
    check_patient_access(patient_id, user)
    get_patient_or_404(db, patient_id)
    if biomarker_id not in BIOMARKERS:
        raise HTTPException(404, f"Unknown biomarker '{biomarker_id}'")
    q = db.query(BiomarkerReading).filter_by(patient_id=patient_id, biomarker_id=biomarker_id)
    if since_hours:
        from datetime import timedelta
        q = q.filter(BiomarkerReading.measured_at >= utcnow() - timedelta(hours=since_hours))
    rows = q.order_by(BiomarkerReading.measured_at.desc(), BiomarkerReading.id.desc()).limit(limit).all()[::-1]
    return ok([ReadingOut.model_validate(r).model_dump(mode="json") for r in rows],
              {"unit": BIOMARKERS[biomarker_id].unit, "count": len(rows)})


@router.post("/{patient_id}/readings", status_code=201)
def add_reading(patient_id: str, body: ReadingCreate, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    """Manual DEMO ingestion (stored with source='manual_demo')."""
    p = get_patient_or_404(db, patient_id)
    try:
        r = store_biomarker(db, p.id, body.biomarker_id, body.value, body.measured_at or utcnow(),
                            "manual_demo", body.quality, None, body.unit)
    except ValidationFailure as e:
        raise HTTPException(422, str(e))
    db.flush()
    run_assessment(db, p)
    db.commit()
    return ok(ReadingOut.model_validate(r).model_dump(mode="json"))


@router.get("/{patient_id}/vitals")
def vitals_history(patient_id: str, kind: Optional[str] = None, limit: int = Query(100, ge=1, le=1000),
                   db: Session = Depends(get_db), user: User = Depends(get_user)):
    check_patient_access(patient_id, user)
    get_patient_or_404(db, patient_id)
    q = db.query(VitalSign).filter_by(patient_id=patient_id)
    if kind:
        q = q.filter_by(kind=kind)
    rows = q.order_by(VitalSign.measured_at.desc(), VitalSign.id.desc()).limit(limit).all()[::-1]
    return ok([VitalOut.model_validate(r).model_dump(mode="json") for r in rows], {"count": len(rows)})


@router.get("/{patient_id}/risk-history")
def risk_history(patient_id: str, limit: int = Query(100, ge=1, le=1000),
                 db: Session = Depends(get_db), user: User = Depends(get_user)):
    check_patient_access(patient_id, user)
    get_patient_or_404(db, patient_id)
    rows = (db.query(RiskAssessment).filter_by(patient_id=patient_id)
            .order_by(RiskAssessment.computed_at.desc(), RiskAssessment.id.desc()).limit(limit).all()[::-1])
    return ok([AssessmentOut.model_validate(r).model_dump(mode="json") for r in rows], {"count": len(rows)})


@router.post("/{patient_id}/assess")
def assess_now(patient_id: str, db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    p = get_patient_or_404(db, patient_id)
    rec = run_assessment(db, p)
    db.commit()
    return ok(AssessmentOut.model_validate(rec).model_dump(mode="json"))


@router.get("/{patient_id}/device-history")
def device_history(patient_id: str, db: Session = Depends(get_db), user: User = Depends(get_user)):
    check_patient_access(patient_id, user)
    p = get_patient_or_404(db, patient_id)
    out = []
    for d in p.devices:
        for log in db.query(DeviceStatusLog).filter_by(device_id=d.id).order_by(DeviceStatusLog.ts).all():
            out.append({"device_id": d.id, "kind": d.kind, "status": log.status, "ts": _iso(log.ts)})
    out.sort(key=lambda x: x["ts"])
    return ok(out)


@router.get("/{patient_id}/notes")
def list_notes(patient_id: str, db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    get_patient_or_404(db, patient_id)
    rows = db.query(ClinicalNote).filter_by(patient_id=patient_id).order_by(ClinicalNote.created_at.desc(), ClinicalNote.id.desc()).all()
    return ok([NoteOut.model_validate(r).model_dump(mode="json") for r in rows])


@router.post("/{patient_id}/notes", status_code=201)
def add_note(patient_id: str, body: NoteCreate, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    p = get_patient_or_404(db, patient_id)
    n = ClinicalNote(patient_id=p.id, author_id=user.id, body=body.body, review_status=body.review_status)
    db.add(n)
    if body.review_status:
        p.review_status = body.review_status
    db.commit()
    return ok(NoteOut.model_validate(n).model_dump(mode="json"))


@router.get("/{patient_id}/preferences")
def get_preferences(patient_id: str, db: Session = Depends(get_db), user: User = Depends(get_user)):
    check_patient_access(patient_id, user)
    pref = db.get(UserPreference, patient_id) or (_ for _ in ()).throw(HTTPException(404, "Patient not found"))
    return ok({"language": pref.language, "notify_alerts": pref.notify_alerts, "notify_device": pref.notify_device})


@router.put("/{patient_id}/preferences")
def update_preferences(patient_id: str, body: PreferencesUpdate, db: Session = Depends(get_db), user: User = Depends(get_user)):
    check_patient_access(patient_id, user)
    pref = db.get(UserPreference, patient_id)
    if not pref:
        raise HTTPException(404, "Patient not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(pref, k, v)
    db.commit()
    return ok({"language": pref.language, "notify_alerts": pref.notify_alerts, "notify_device": pref.notify_device})
