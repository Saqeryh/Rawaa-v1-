"""Doctor dashboard endpoints: patch-attachment toggle and physician intervention audit."""
from tests.conftest import DOC, pat

B = "/api/v1"


def data(r):
    assert r.status_code < 300, r.text
    body = r.json()
    assert body["error"] is None
    return body["data"]


def test_connection_toggle_attaches_and_detaches_patch(client):
    d = data(client.post(f"{B}/simulation/P-1001/connection", json={"connected": False}, headers=DOC))
    assert d["patient_id"] == "P-1001" and d["connected"] is False and d["changed"] is True
    assert all(x["status"] == "disconnected" for x in d["devices"])
    detail = data(client.get(f"{B}/patients/P-1001", headers=DOC))
    assert detail["devices_connected"] == 0 and detail["devices_total"] == 2

    d2 = data(client.post(f"{B}/simulation/P-1001/connection",
                          json={"connected": True, "kind": "wearable_patch"}, headers=DOC))
    statuses = {x["kind"]: x["status"] for x in d2["devices"]}
    assert statuses["wearable_patch"] == "connected"
    assert statuses["electrochemical_aptasensor"] == "disconnected"  # only the requested kind changed

    ev = data(client.get(f"{B}/simulation/events", headers=DOC))
    assert any(e["kind"] == "device_disconnected" and e["patient_id"] == "P-1001" for e in ev)
    assert any(e["kind"] == "device_connected" and e["patient_id"] == "P-1001" for e in ev)


def test_connection_toggle_requires_doctor_and_known_patient(client):
    assert client.post(f"{B}/simulation/P-1001/connection", json={"connected": True},
                       headers=pat("P-1001")).status_code == 403
    assert client.post(f"{B}/simulation/NOPE/connection", json={"connected": True}, headers=DOC).status_code == 404
    assert client.post(f"{B}/simulation/P-1001/connection", json={"connected": None}, headers=DOC).status_code == 422
    assert client.post(f"{B}/simulation/P-1001/connection",
                       json={"connected": True, "kind": "glucose"}, headers=DOC).status_code == 422


def test_intervention_logs_physician_audit_note(client):
    r = client.post(f"{B}/simulation/P-1004/intervention",
                    json={"body": "Reviewed the simulated bridge decision.", "review_status": "reviewed"},
                    headers=DOC)
    n = data(r)
    assert n["patient_id"] == "P-1004" and n["doctor_entered"] is True and n["author_id"] == "D-001"
    assert n["review_status"] == "reviewed"
    assert "No treatment was administered" in r.json()["meta"]["notice"]
    assert not any(k in n for k in ("dose", "drug", "dosage"))  # audit payload never carries a dose

    # the review status and the audit trail are visible through the existing APIs
    assert data(client.get(f"{B}/patients/P-1004", headers=DOC))["review_status"] == "reviewed"
    notes = data(client.get(f"{B}/patients/P-1004/notes", headers=DOC))
    assert any(x["id"] == n["id"] and x["body"] == "Reviewed the simulated bridge decision." for x in notes)
    ev = data(client.get(f"{B}/simulation/events", headers=DOC))
    assert any(e["kind"] == "simulated_intervention_review" and e["patient_id"] == "P-1004" for e in ev)


def test_intervention_validation_and_auth(client):
    assert client.post(f"{B}/simulation/P-1004/intervention", json={"body": ""}, headers=DOC).status_code == 422
    assert client.post(f"{B}/simulation/NOPE/intervention", json={"body": "x"}, headers=DOC).status_code == 404
    assert client.post(f"{B}/simulation/P-1004/intervention", json={"body": "x"},
                       headers=pat("P-1004")).status_code == 403
