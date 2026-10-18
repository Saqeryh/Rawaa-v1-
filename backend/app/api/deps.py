"""DEVELOPMENT-ONLY authentication.

Bearer tokens: the doctor token (env DEV_DOCTOR_TOKEN) or `dev-patient-<PATIENT_ID>-token`.
This is NOT production security: tokens are guessable by design so the demo runs offline.
Production must replace `get_user` with Supabase Auth / OIDC JWT verification.
Authorization rules (enforced here) are real: patients only reach their own records.
"""
import hmac
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException

from app.core.config import get_settings


@dataclass
class User:
    role: str  # doctor | patient
    id: str
    patient_id: Optional[str] = None


def get_user(authorization: Optional[str] = Header(None)) -> User:
    s = get_settings()
    if s.auth_mode != "dev":
        raise HTTPException(501, "Only AUTH_MODE=dev is implemented; integrate Supabase Auth for production.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization[7:]
    if hmac.compare_digest(token, s.dev_doctor_token):
        return User("doctor", "D-001")
    if token.startswith("dev-patient-") and token.endswith("-token"):
        pid = token[len("dev-patient-"):-len("-token")]
        if pid:
            return User("patient", pid, pid)
    raise HTTPException(401, "Invalid token")


def require_doctor(user: User = Depends(get_user)) -> User:
    if user.role != "doctor":
        raise HTTPException(403, "Doctor role required")
    return user


def check_patient_access(patient_id: str, user: User):
    if user.role == "doctor" or user.patient_id == patient_id:
        return
    raise HTTPException(403, "Not allowed to access this patient's records")
