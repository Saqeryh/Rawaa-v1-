import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.common import get_patient_or_404, ok
from app.api.deps import User, require_doctor
from app.core.config import get_settings
from app.database import db as dbmod
from app.database.db import get_db
from app.database.models import ClinicalNote, SimulationEvent, utcnow
from app.schemas import ConnectionToggle, InterventionCreate, NoteOut, SimEventOut, _iso
from app.services.assessment import run_assessment
from app.simulation.engine import SimState, log_event, set_connection, tick_all, tick_patient

log = logging.getLogger("rawa.simulation")
router = APIRouter(prefix="/simulation", tags=["simulation"])
LABEL = "Simulated updates — not real sensor measurements"


def _state():
    return {"status": SimState.status, "tick_count": SimState.tick_count,
            "last_tick_at": _iso(SimState.last_tick_at) if SimState.last_tick_at else None,
            "interval_seconds": get_settings().sim_interval, "label": LABEL}


async def _loop():
    while SimState.status in ("running", "paused"):
        await asyncio.sleep(get_settings().sim_interval)

        def work():
            # The lock + status re-check make "pause" a hard boundary: once pause() has
            # returned, no tick that started earlier can still write readings.
            with SimState.lock:
                if SimState.status != "running":
                    return
                with dbmod.session() as s:
                    tick_all(s)

        try:
            await asyncio.to_thread(work)
        except Exception:  # keep the loop alive; the error is logged, never leaked
            log.exception("simulation tick failed")


def _ensure_task():
    if get_settings().sim_autoloop and (SimState.task is None or SimState.task.done()):
        SimState.task = asyncio.get_running_loop().create_task(_loop())


@router.get("/state")
def state(_: User = Depends(require_doctor)):
    return ok(_state())


@router.post("/start")
async def start(db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    with SimState.lock:
        if SimState.status == "running":
            raise HTTPException(409, "Simulation already running")
        if SimState.status == "paused":
            raise HTTPException(409, "Simulation is paused; use resume")
        SimState.status = "running"
        log_event(db, "simulation_started")
        db.commit()
    _ensure_task()
    return ok(_state())


@router.post("/pause")
def pause(db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    with SimState.lock:
        if SimState.status != "running":
            raise HTTPException(409, "Simulation is not running")
        SimState.status = "paused"
        log_event(db, "simulation_paused")
        db.commit()
    return ok(_state())


@router.post("/resume")
async def resume(db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    with SimState.lock:
        if SimState.status != "paused":
            raise HTTPException(409, "Simulation is not paused")
        SimState.status = "running"
        log_event(db, "simulation_resumed")
        db.commit()
    _ensure_task()
    return ok(_state())


@router.post("/reset")
def reset(_: User = Depends(require_doctor)):
    """Stops the simulation and restores the original synthetic dataset."""
    with SimState.lock:
        dbmod.reset_database(seed=True)
        SimState.reset()  # only after the data is restored, so pollers never see "stopped" mid-reset
    return ok(_state())


@router.post("/tick")
def tick(db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    """Advance every active patient by one reading (manual step; works while stopped/paused)."""
    with SimState.lock:
        n = tick_all(db)
    return ok({"patients_updated": n, **_state()})


@router.post("/patients/{patient_id}/generate")
def generate_reading(patient_id: str, db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    p = get_patient_or_404(db, patient_id)
    summary = tick_patient(db, p)
    db.commit()
    return ok(summary)


@router.post("/patients/{patient_id}/disconnect")
def disconnect(patient_id: str, kind: str | None = Query(None, pattern="^(wearable_patch|electrochemical_aptasensor)$"),
               db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    p = get_patient_or_404(db, patient_id)
    changed = set_connection(db, p, False, kind)
    db.commit()
    return ok({"changed": changed})


@router.post("/patients/{patient_id}/restore")
def restore(patient_id: str, kind: str | None = Query(None, pattern="^(wearable_patch|electrochemical_aptasensor)$"),
            db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    p = get_patient_or_404(db, patient_id)
    changed = set_connection(db, p, True, kind)
    db.commit()
    return ok({"changed": changed})


@router.post("/patients/{patient_id}/missing-data")
def missing_data(patient_id: str, db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    p = get_patient_or_404(db, patient_id)
    p.force_missing = True
    log_event(db, "missing_data_armed", p.id, "next reading will have missing biomarker values")
    db.commit()
    return ok({"armed": True})


@router.post("/{patient_id}/connection")
def toggle_connection(patient_id: str, body: ConnectionToggle, db: Session = Depends(get_db),
                      _: User = Depends(require_doctor)):
    """Toggle patch/sensor attachment status for one patient (doctor dashboard simulation tool)."""
    p = get_patient_or_404(db, patient_id)
    changed = set_connection(db, p, body.connected, body.kind)
    db.commit()
    return ok({"patient_id": p.id, "connected": body.connected, "kind": body.kind, "changed": changed,
               "devices": [{"id": d.id, "kind": d.kind, "status": d.status} for d in p.devices]},
              {"notice": LABEL})


@router.post("/{patient_id}/intervention")
def intervention(patient_id: str, body: InterventionCreate, db: Session = Depends(get_db),
                  user: User = Depends(require_doctor)):
    """Human-in-the-loop audit: registers the physician's review note for a simulated intervention decision.

    Writes a doctor-entered clinical note (and the requested review status) plus a simulation event.
    Nothing is administered: no dose, no drug and no device control exists in this system.
    """
    p = get_patient_or_404(db, patient_id)
    note = ClinicalNote(patient_id=p.id, author_id=user.id, body=body.body, review_status=body.review_status)
    db.add(note)
    if body.review_status:
        p.review_status = body.review_status
    db.flush()
    log_event(db, "simulated_intervention_review", p.id, f"note={note.id}")
    db.commit()
    return ok(NoteOut.model_validate(note).model_dump(mode="json"),
              {"notice": "Audit note only. No treatment was administered; no dose, drug or device control exists in this system."})


@router.get("/events")
def events(limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db), _: User = Depends(require_doctor)):
    rows = db.query(SimulationEvent).order_by(SimulationEvent.ts.desc(), SimulationEvent.id.desc()).limit(limit).all()
    return ok([SimEventOut.model_validate(r).model_dump(mode="json") for r in rows])
