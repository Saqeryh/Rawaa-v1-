"""DEMO DATA -- SYNTHETIC PATIENTS -- NOT FOR CLINICAL USE.

All names are fictional. Readings come from the deterministic generator
(source='synthetic_seed'); nothing here was measured on a person.
"""
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.biomarkers import SENSORS
from app.database.models import (Alert, Device, DeviceStatusLog, Doctor, Patient, UserPreference, utcnow)
from app.services.assessment import run_assessment
from app.simulation.engine import write_step, log_event

HISTORY_STEPS = 24  # hourly

PATIENTS = [
    # id, name, age, context, scenario, extra
    ("P-1001", "Layla Hassan", 61, "Post-operative, day 4 (synthetic)", "stable", {}),
    ("P-1002", "Omar Nasser", 58, "Oncology outpatient (synthetic)", "rising", {}),
    ("P-1003", "Sara Kim", 47, "Long-haul travel, limited mobility (synthetic)", "pre_thrombotic", {}),
    ("P-1004", "Yousef Al-Amri", 66, "ICU step-down transition (synthetic)", "critical", {}),
    ("P-1005", "Huda Farouk", 72, "Bed-bound, frequent missing readings (synthetic)", "missing_data", {}),
    ("P-1006", "Karim Adel", 55, "Cardiovascular risk, patch detached (synthetic)", "disconnected", {"disconnect_at": 18}),
    ("P-1007", "Mina Park", 39, "Post-operative, awaiting clinical review (synthetic)", "pending_review", {"review": True}),
    ("P-1008", "Reem Saleh", 44, "Recently enrolled, stable (synthetic)", "stable", {"steps": 6}),
]


def seed_demo_data(db: Session):
    now = utcnow()
    db.add(Doctor(id="D-001", name="Dr. Demo Clinician (fictional)"))
    for pid, name, age, ctx, scenario, extra in PATIENTS:
        steps = extra.get("steps", HISTORY_STEPS)
        start = now - timedelta(hours=steps - 1)
        p = Patient(id=pid, display_name=name, age=age, clinical_context=ctx, scenario=scenario,
                    monitoring_start=start, created_at=start)
        db.add(p)
        db.add(UserPreference(patient_id=pid))
        for kind in ("wearable_patch", "electrochemical_aptasensor"):
            db.add(Device(patient=p, kind=kind, name=SENSORS[kind]["names"]["en"], status="connected", conceptual=True))
        db.flush()
        for d in p.devices:
            db.add(DeviceStatusLog(device_id=d.id, status="connected", ts=start))
        cut = extra.get("disconnect_at")
        for i in range(steps):
            ts = now - timedelta(hours=steps - 1 - i)
            if cut is not None and i == cut:
                for d in p.devices:
                    d.status = "disconnected"
                    db.add(DeviceStatusLog(device_id=d.id, status="disconnected", ts=ts))
            write_step(db, p, ts, "synthetic_seed")
            db.flush()
            run_assessment(db, p, ts)
            db.flush()
        run_assessment(db, p, now)  # current-state assessment (detects stale data)
        if extra.get("review"):
            p.review_status = "pending_review"
            db.add(Alert(patient_id=pid, kind="risk", severity="info", message_key="alert.risk.rising_activity",
                         params={}, created_at=now - timedelta(hours=1)))
        if cut is not None:
            db.add(Alert(patient_id=pid, kind="device_disconnected", severity="warning",
                         message_key="alert.device_disconnected", params={"device_kind": "all"},
                         created_at=now - timedelta(hours=steps - 1 - cut)))
    log_event(db, "seed_completed", None, "synthetic demo dataset loaded")
    db.commit()
