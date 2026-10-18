"""Wearable simulator: writes SYNTHETIC readings through the same ingest path as real data would use."""
import threading
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.database.models import (Alert, Device, DeviceStatusLog, Patient, SimulationEvent, utcnow)
from app.services.assessment import run_assessment
from app.services.ingest import store_biomarker, store_vital, touch_device
from app.core.biomarkers import BIOMARKERS
from app.simulation.generator import generate

SOURCE_LIVE = "simulator"


class SimState:
    status = "stopped"  # stopped | running | paused
    tick_count = 0
    last_tick_at: Optional[datetime] = None
    task = None
    lock = threading.RLock()  # serialises state changes, ticks and reset

    @classmethod
    def reset(cls):
        cls.status, cls.tick_count, cls.last_tick_at = "stopped", 0, None


def log_event(db: Session, kind: str, patient_id: Optional[str] = None, detail: str = ""):
    db.add(SimulationEvent(kind=kind, patient_id=patient_id, detail=detail, ts=utcnow()))


def write_step(db: Session, patient: Patient, ts: datetime, source: str, force_missing: bool = False) -> dict:
    """Write one generated reading set for every *connected* device. Returns a summary."""
    bio, vit = generate(patient.scenario, patient.sim_step, patient.id, force_missing or patient.force_missing)
    wearable = next((d for d in patient.devices if d.kind == "wearable_patch"), None)
    apta = next((d for d in patient.devices if d.kind == "electrochemical_aptasensor"), None)
    written, skipped, missing = 0, [], 0
    for bid, (val, q) in bio.items():
        dev = apta if BIOMARKERS[bid].sensor_kind == "electrochemical_aptasensor" else wearable
        if dev is None or dev.status != "connected":
            skipped.append(bid)
            continue
        store_biomarker(db, patient.id, bid, val, ts, source, q, dev.id)
        touch_device(db, dev, ts)
        written += 1
        missing += q == "missing"
    if wearable and wearable.status == "connected":
        for kind, (val, q) in vit.items():
            store_vital(db, patient.id, kind, val, ts, source, q, wearable.id)
    patient.sim_step += 1
    patient.force_missing = False
    return {"written": written, "skipped": skipped, "missing": missing}


def _open_alert_exists(db: Session, patient_id: str, kind: str) -> bool:
    return db.query(Alert).filter_by(patient_id=patient_id, kind=kind, status="open").first() is not None


def tick_patient(db: Session, patient: Patient) -> dict:
    now = utcnow()
    summary = write_step(db, patient, now, SOURCE_LIVE)
    if summary["skipped"]:
        log_event(db, "reading_skipped_disconnected", patient.id, ",".join(summary["skipped"]))
    if summary["missing"] and not _open_alert_exists(db, patient.id, "missing_data"):
        db.add(Alert(patient_id=patient.id, kind="missing_data", severity="info",
                     message_key="alert.missing_data", params={}, created_at=now))
    log_event(db, "reading_generated", patient.id, f"step={patient.sim_step} written={summary['written']}")
    run_assessment(db, patient, now)
    return summary


def tick_all(db: Session) -> int:
    n = 0
    for p in db.query(Patient).filter(Patient.monitoring_status == "active").all():
        tick_patient(db, p)
        n += 1
    SimState.tick_count += 1
    SimState.last_tick_at = utcnow()
    db.commit()
    return n


def set_connection(db: Session, patient: Patient, connected: bool, kind: Optional[str] = None):
    status = "connected" if connected else "disconnected"
    now = utcnow()
    changed = False
    for d in patient.devices:
        if kind and d.kind != kind:
            continue
        if d.status != status:
            d.status = status
            db.add(DeviceStatusLog(device_id=d.id, status=status, ts=now))
            changed = True
    if changed:
        log_event(db, "device_" + status, patient.id, kind or "all")
        if not connected and not _open_alert_exists(db, patient.id, "device_disconnected"):
            db.add(Alert(patient_id=patient.id, kind="device_disconnected", severity="warning",
                         message_key="alert.device_disconnected", params={"device_kind": kind or "all"}, created_at=now))
    return changed
