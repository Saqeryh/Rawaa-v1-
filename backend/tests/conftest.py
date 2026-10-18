import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SIM_AUTOLOOP"] = "false"
os.environ["SEED_ON_START"] = "false"
os.environ["DEV_DOCTOR_TOKEN"] = "test-doctor"

import pytest
from fastapi.testclient import TestClient

from app.database import db as dbmod
from app.main import app
from app.simulation.engine import SimState

DOC = {"Authorization": "Bearer test-doctor"}


def pat(pid):
    return {"Authorization": f"Bearer dev-patient-{pid}-token"}


@pytest.fixture()
def client():
    dbmod.configure(os.environ["DATABASE_URL"])
    SimState.reset()
    dbmod.reset_database(seed=True)
    with TestClient(app) as c:
        yield c
