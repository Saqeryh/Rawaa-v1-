from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    """Naive UTC datetime (all timestamps in the DB are UTC)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Doctor(Base):
    __tablename__ = "doctors"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80))
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    clinical_context: Mapped[str] = mapped_column(String(300), default="")
    monitoring_start: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    monitoring_status: Mapped[str] = mapped_column(String(20), default="active")  # active|paused|discharged
    review_status: Mapped[str] = mapped_column(String(20), default="none")  # none|pending_review|reviewed|follow_up
    scenario: Mapped[str] = mapped_column(String(30), default="stable")
    sim_step: Mapped[int] = mapped_column(Integer, default=0)
    force_missing: Mapped[bool] = mapped_column(Boolean, default=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    devices: Mapped[list["Device"]] = relationship(back_populates="patient", cascade="all, delete-orphan")


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40))  # wearable_patch | electrochemical_aptasensor
    name: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), default="connected")  # connected|disconnected
    conceptual: Mapped[bool] = mapped_column(Boolean, default=True)
    last_reading_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    patient: Mapped[Patient] = relationship(back_populates="devices")


class DeviceStatusLog(Base):
    __tablename__ = "device_status_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class BiomarkerReading(Base):
    __tablename__ = "biomarker_readings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"))
    biomarker_id: Mapped[str] = mapped_column(String(30))
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(20))
    measured_at: Mapped[datetime] = mapped_column(DateTime)
    source: Mapped[str] = mapped_column(String(20))  # synthetic_seed | simulator | manual_demo
    quality: Mapped[str] = mapped_column(String(10), default="ok")  # ok | poor | missing
    device_id: Mapped[Optional[int]] = mapped_column(ForeignKey("devices.id"), nullable=True)
    __table_args__ = (Index("ix_bio_patient_marker_time", "patient_id", "biomarker_id", "measured_at"),)


class VitalSign(Base):
    __tablename__ = "vital_signs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"))
    kind: Mapped[str] = mapped_column(String(20))
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(10))
    measured_at: Mapped[datetime] = mapped_column(DateTime)
    source: Mapped[str] = mapped_column(String(20))
    quality: Mapped[str] = mapped_column(String(10), default="ok")
    device_id: Mapped[Optional[int]] = mapped_column(ForeignKey("devices.id"), nullable=True)
    __table_args__ = (Index("ix_vital_patient_kind_time", "patient_id", "kind", "measured_at"),)


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    category: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    category_key: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20))  # ok | insufficient_data
    source: Mapped[str] = mapped_column(String(30))  # demonstration_rule | synthetic_model | trained_model
    model_version: Mapped[str] = mapped_column(String(30))
    computed_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))  # risk | device_disconnected | missing_data
    severity: Mapped[str] = mapped_column(String(10))  # info | warning | critical
    message_key: Mapped[str] = mapped_column(String(60))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(15), default="open")  # open | acknowledged
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    auto_generated: Mapped[bool] = mapped_column(Boolean, default=True)


class ClinicalNote(Base):
    __tablename__ = "clinical_notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    author_id: Mapped[str] = mapped_column(String(30))
    body: Mapped[str] = mapped_column(Text)
    review_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    doctor_entered: Mapped[bool] = mapped_column(Boolean, default=True)


class InterventionProposal(Base):
    """SIMULATED workflow object. No dose, no drug, no pump control -- ever."""
    __tablename__ = "intervention_proposals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    assessment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("risk_assessments.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(15), default="pending")  # pending | confirmed | cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class SimulationEvent(Base):
    __tablename__ = "simulation_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    patient_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(String(300), default="")


class UserPreference(Base):
    __tablename__ = "user_preferences"
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), primary_key=True)
    language: Mapped[str] = mapped_column(String(5), default="ar")
    notify_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_device: Mapped[bool] = mapped_column(Boolean, default=True)
