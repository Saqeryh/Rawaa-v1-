"""Real background-loop tests: readings must stop while paused and continue after resume."""
import time

import pytest

from tests.conftest import DOC
from app.simulation.engine import SimState

B = "/api/v1"


@pytest.fixture()
def live(client, monkeypatch):
    monkeypatch.setenv("SIM_AUTOLOOP", "true")
    monkeypatch.setenv("SIM_INTERVAL_SECONDS", "0.05")
    SimState.task = None
    yield client
    client.post(f"{B}/simulation/reset", headers=DOC)  # stops the loop
    time.sleep(0.15)
    SimState.task = None


def count(c):
    r = c.get(f"{B}/patients/P-1001/biomarkers/hs_crp/history?limit=1000", headers=DOC).json()
    return r["meta"]["count"]


def wait_until(pred, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.05)
    return False


def test_readings_stop_while_paused_and_continue_after_resume(live):
    c = live
    n0 = count(c)
    assert c.post(f"{B}/simulation/start", headers=DOC).status_code == 200
    assert wait_until(lambda: count(c) > n0), "no readings while running"

    assert c.post(f"{B}/simulation/pause", headers=DOC).status_code == 200
    time.sleep(0.05)
    paused_count = count(c)
    events_paused = len(c.get(f"{B}/simulation/events?limit=500", headers=DOC).json()["data"])
    time.sleep(0.6)  # ~12 loop intervals
    assert count(c) == paused_count, "readings kept arriving while paused"
    assert len(c.get(f"{B}/simulation/events?limit=500", headers=DOC).json()["data"]) == events_paused
    assert c.get(f"{B}/simulation/state", headers=DOC).json()["data"]["status"] == "paused"

    assert c.post(f"{B}/simulation/resume", headers=DOC).status_code == 200
    assert wait_until(lambda: count(c) > paused_count), "readings did not continue after resume"
    assert c.get(f"{B}/simulation/state", headers=DOC).json()["data"]["status"] == "running"


def test_no_reading_lands_after_pause_returns(live):
    """Pause must be a hard boundary even when a tick is in flight."""
    c = live
    assert c.post(f"{B}/simulation/start", headers=DOC).status_code == 200
    for _ in range(5):
        wait_until(lambda: count(c) > 0)
        assert c.post(f"{B}/simulation/pause", headers=DOC).status_code == 200
        snapshot = count(c)          # taken the instant pause returned
        time.sleep(0.25)
        assert count(c) == snapshot
        assert c.post(f"{B}/simulation/resume", headers=DOC).status_code == 200
        time.sleep(0.1)


def test_manual_tick_still_works_while_paused(live):
    c = live
    c.post(f"{B}/simulation/start", headers=DOC)
    c.post(f"{B}/simulation/pause", headers=DOC)
    time.sleep(0.15)
    n = count(c)
    assert c.post(f"{B}/simulation/tick", headers=DOC).status_code == 200
    assert count(c) == n + 1


def test_start_while_paused_is_rejected(live):
    c = live
    c.post(f"{B}/simulation/start", headers=DOC)
    c.post(f"{B}/simulation/pause", headers=DOC)
    assert c.post(f"{B}/simulation/start", headers=DOC).status_code == 409  # must use resume


def test_reset_stops_loop_and_restores_data(live):
    c = live
    c.post(f"{B}/simulation/start", headers=DOC)
    wait_until(lambda: count(c) > 24)
    assert c.post(f"{B}/simulation/reset", headers=DOC).status_code == 200
    time.sleep(0.3)
    assert count(c) == 24
    assert c.get(f"{B}/simulation/state", headers=DOC).json()["data"]["status"] == "stopped"


def test_reset_is_atomic_for_concurrent_readers(client):
    """UIs poll while a reset runs: readers must never see an empty database or a missing patient."""
    import threading
    client.post(f"{B}/patients", json={"display_name": "Extra"}, headers=DOC)  # 9 patients before reset
    seen, stop = [], threading.Event()

    def reader():
        while not stop.is_set():
            r = client.get(f"{B}/patients/P-1001", headers=DOC)
            seen.append(r.status_code)

    threads = [threading.Thread(target=reader) for _ in range(3)]
    for t in threads:
        t.start()
    for _ in range(3):
        assert client.post(f"{B}/simulation/reset", headers=DOC).status_code == 200
    stop.set()
    for t in threads:
        t.join()
    assert seen and set(seen) == {200}, f"readers saw non-200 during reset: {sorted(set(seen))}"
    assert len(client.get(f"{B}/patients", headers=DOC).json()["data"]) == 8
