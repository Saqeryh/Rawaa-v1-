"""Pydantic request/response schemas. All responses use the envelope {data, error, meta}."""
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator


def _iso(d: datetime) -> str:
    return d.isoformat() + "Z" if d.tzinfo is None else d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UTC = Annotated[datetime, PlainSerializer(_iso, return_type=str)]

Scenario = Literal["stable", "rising", "pre_thrombotic", "critical", "missing_data", "disconnected", "pending_review"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def naive_utc(v: Optional[datetime]) -> Optional[datetime]:
    if v is not None and v.tzinfo is not None:
        return v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


# ---- requests ----
class PatientCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    age: Optional[int] = Field(None, ge=0, le=120)
    clinical_context: str = Field("", max_length=300)
    scenario: Scenario = "stable"


class PatientUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=80)
    age: Optional[int] = Field(None, ge=0, le=120)
    clinical_context: Optional[str] = Field(None, max_length=300)
    monitoring_status: Optional[Literal["active", "paused", "discharged"]] = None


class ReadingCreate(BaseModel):
    biomarker_id: str
    value: Optional[float] = None
    unit: Optional[str] = None
    measured_at: Optional[datetime] = None
    quality: Literal["ok", "poor", "missing"] = "ok"

    @field_validator("measured_at")
    @classmethod
    def _naive(cls, v):
        return naive_utc(v)


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    review_status: Optional[Literal["pending_review", "reviewed", "follow_up"]] = None


class ConnectionToggle(BaseModel):
    """Attach / detach a simulated patient device (patch attachment status)."""
    connected: bool
    kind: Optional[Literal["wearable_patch", "electrochemical_aptasensor"]] = None


class InterventionCreate(BaseModel):
    """Human-in-the-loop audit record: the physician's review note for a simulated intervention decision.

    Carries no dose, drug or device-control field — this system never administers anything.
    """
    body: str = Field(min_length=1, max_length=2000)
    review_status: Optional[Literal["pending_review", "reviewed", "follow_up"]] = None


class PreferencesUpdate(BaseModel):
    language: Optional[Literal["ar", "en", "ko"]] = None
    notify_alerts: Optional[bool] = None
    notify_device: Optional[bool] = None


# ---- responses ----
class DeviceOut(ORM):
    id: int
    kind: str
    name: str
    status: str
    conceptual: bool
    last_reading_at: Optional[UTC]


class ReadingOut(ORM):
    biomarker_id: str
    value: Optional[float]
    unit: str
    measured_at: UTC
    source: str
    quality: str


class VitalOut(ORM):
    kind: str
    value: Optional[float]
    unit: str
    measured_at: UTC
    source: str
    quality: str


class AssessmentOut(ORM):
    id: int
    category: Optional[int]
    category_key: Optional[str]
    status: str
    source: str
    model_version: str
    computed_at: UTC
    details: dict[str, Any]


class AlertOut(ORM):
    id: int
    patient_id: str
    kind: str
    severity: str
    message_key: str
    params: dict[str, Any]
    status: str
    created_at: UTC
    acknowledged_by: Optional[str]
    acknowledged_at: Optional[UTC]
    auto_generated: bool


class NoteOut(ORM):
    id: int
    patient_id: str
    author_id: str
    body: str
    review_status: Optional[str]
    created_at: UTC
    doctor_entered: bool


class ProposalOut(ORM):
    id: int
    patient_id: str
    status: str
    created_at: UTC
    resolved_at: Optional[UTC]
    resolved_by: Optional[str]
    is_simulated: bool


class SimEventOut(ORM):
    id: int
    ts: UTC
    patient_id: Optional[str]
    kind: str
    detail: str


class PatientSummary(ORM):
    id: str
    display_name: str
    age: Optional[int]
    clinical_context: str
    monitoring_status: str
    review_status: str
    scenario: str
    is_synthetic: bool
    monitoring_start: UTC
    risk: Optional[AssessmentOut] = None
    devices_connected: int = 0
    devices_total: int = 0
    last_update: Optional[UTC] = None
