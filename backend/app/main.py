"""RAWA | ThrombiX backend. DEMO / RESEARCH PROTOTYPE -- not a medical device."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import monitoring, patients, simulation
from app.core.config import get_settings
from app.database import db as dbmod
from app.database.models import Base, Patient


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = dbmod.get_engine()
    Base.metadata.create_all(engine)
    if get_settings().seed_on_start:
        with dbmod.session() as s:
            if s.query(Patient).count() == 0:
                from app.database.seed import seed_demo_data
                seed_demo_data(s)
    yield


app = FastAPI(title="RAWA | ThrombiX API (demo)", version="0.1.0", lifespan=lifespan,
              description="Research and demonstration prototype. Synthetic data only. Not for clinical use.")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins, allow_methods=["*"], allow_headers=["*"])


def _err(status: int, code: str, message, details=None):
    return JSONResponse(status_code=status, content={"data": None, "meta": None,
                        "error": {"code": code, "message": message, "details": details}})


@app.exception_handler(HTTPException)
async def http_exc(_: Request, exc: HTTPException):
    return _err(exc.status_code, f"http_{exc.status_code}", exc.detail)


@app.exception_handler(RequestValidationError)
async def validation_exc(_: Request, exc: RequestValidationError):
    details = [{"loc": [str(x) for x in e["loc"]], "msg": e["msg"]} for e in exc.errors()]
    return _err(422, "validation_error", "Invalid request", details)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    return _err(500, "internal_error", "Unexpected server error")  # no internals leaked


for r in (monitoring.router, patients.router, simulation.router):
    app.include_router(r, prefix="/api/v1")
