"""Configuration from environment variables (see .env.example). Never hardcode secrets."""
import os
from dataclasses import dataclass


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    auth_mode: str            # "dev" only, for now. Production must use Supabase Auth / OIDC.
    dev_doctor_token: str
    sim_interval: float
    sim_autoloop: bool
    seed_on_start: bool
    cors_origins: list


def get_settings() -> Settings:
    return Settings(
        environment=os.getenv("APP_ENV", "development"),
        database_url=os.getenv("DATABASE_URL", "sqlite:///./rawa_demo.db"),
        auth_mode=os.getenv("AUTH_MODE", "dev"),
        dev_doctor_token=os.getenv("DEV_DOCTOR_TOKEN", "dev-doctor-token"),
        sim_interval=float(os.getenv("SIM_INTERVAL_SECONDS", "5")),
        sim_autoloop=_bool("SIM_AUTOLOOP", True),
        seed_on_start=_bool("SEED_ON_START", True),
        cors_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
    )
