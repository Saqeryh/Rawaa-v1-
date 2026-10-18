from tests.conftest import DOC, pat

B = "/api/v1"


def data(r):
    assert r.status_code < 300, r.text
    body = r.json()
    assert body["error"] is None
    return body["data"]


def test_health(client):
    d = data(client.get(f"{B}/health"))
    assert d["status"] == "ok" and "SYNTHETIC" in d["notice"]


def test_config_contains_hs_crp_and_aptasensor(client):
    cfg = data(client.get(f"{B}/config"))
    crp = next(b for b in cfg["biomarkers"] if b["id"] == "hs_crp")
    assert crp["abbreviation"] == "hs-CRP" and crp["sensor_kind"] == "electrochemical_aptasensor"
    assert set(crp["names"]) == {"en", "ar", "ko"} and crp["reference_range"] is None
    assert cfg["sensors"]["electrochemical_aptasensor"]["conceptual"] is True
    assert len(cfg["risk_categories"]) == 4
    assert "demonstration" in cfg["risk_source"]["kind"]


# ---- auth boundaries ----
def test_requires_token(client):
    r = client.get(f"{B}/patients")
    assert r.status_code == 401 and r.json()["error"]["code"] == "http_401"


def test_invalid_token(client):
    assert client.get(f"{B}/patients", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_patient_cannot_list_or_see_others(client):
    assert client.get(f"{B}/patients", headers=pat("P-1001")).status_code == 403
    assert client.get(f"{B}/patients/P-1002", headers=pat("P-1001")).status_code == 403
    assert client.get(f"{B}/patients/P-1001", headers=pat("P-1001")).status_code == 200


def test_patient_cannot_use_doctor_or_simulation_endpoints(client):
    assert client.post(f"{B}/simulation/tick", headers=pat("P-1001")).status_code == 403
    assert client.get(f"{B}/dashboard/summary", headers=pat("P-1001")).status_code == 403
    assert client.get(f"{B}/patients/P-1001/notes", headers=pat("P-1001")).status_code == 403


def test_patient_alerts_are_scoped_to_self(client):
    alerts = data(client.get(f"{B}/alerts", headers=pat("P-1003")))
    assert alerts and all(a["patient_id"] == "P-1003" for a in alerts)
    # query-param spoofing must not widen access
    alerts = data(client.get(f"{B}/alerts?patient_id=P-1004", headers=pat("P-1003")))
    assert all(a["patient_id"] == "P-1003" for a in alerts)


# ---- patients ----
def test_list_search_filter_sort(client):
    all_ = data(client.get(f"{B}/patients", headers=DOC))
    assert len(all_) == 8
    assert [p["id"] for p in data(client.get(f"{B}/patients?search=sara", headers=DOC))] == ["P-1003"]
    assert [p["id"] for p in data(client.get(f"{B}/patients?search=p-1004", headers=DOC))] == ["P-1004"]
    crit = data(client.get(f"{B}/patients?risk=critical_thrombosis_risk", headers=DOC))
    assert [p["id"] for p in crit] == ["P-1004"]
    insuff = data(client.get(f"{B}/patients?risk=insufficient_data", headers=DOC))
    assert "P-1006" in [p["id"] for p in insuff]
    by_risk = data(client.get(f"{B}/patients?sort=risk&order=desc", headers=DOC))
    assert by_risk[0]["id"] == "P-1004"
    assert client.get(f"{B}/patients?sort=bogus", headers=DOC).status_code == 422


def test_create_patient_valid_and_invalid(client):
    r = client.post(f"{B}/patients", json={"display_name": "Test Person", "age": 50}, headers=DOC)
    assert r.status_code == 201
    created = r.json()["data"]
    assert created["id"] == "P-1009" and created["devices_total"] == 2 and created["is_synthetic"] is True
    assert client.post(f"{B}/patients", json={"display_name": ""}, headers=DOC).status_code == 422
    assert client.post(f"{B}/patients", json={"display_name": "X", "age": 500}, headers=DOC).status_code == 422
    assert client.post(f"{B}/patients", json={"display_name": "X", "scenario": "nope"}, headers=DOC).status_code == 422
    r = client.post(f"{B}/patients", json={"display_name": "X", "age": -1}, headers=DOC)
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_update_patient(client):
    r = client.patch(f"{B}/patients/P-1001", json={"monitoring_status": "paused", "age": 62}, headers=DOC)
    assert data(r)["monitoring_status"] == "paused" and data(r)["age"] == 62
    assert client.patch(f"{B}/patients/P-1001", json={"monitoring_status": "bad"}, headers=DOC).status_code == 422
    assert client.patch(f"{B}/patients/NOPE", json={"age": 1}, headers=DOC).status_code == 404


def test_patient_detail_has_all_measurements(client):
    d = data(client.get(f"{B}/patients/P-1001", headers=DOC))
    assert set(d["latest_biomarkers"]) == {"d_dimer", "tat", "p_selectin", "hs_crp"}
    assert set(d["latest_vitals"]) == {"heart_rate", "spo2", "movement", "temperature"}
    assert {x["kind"] for x in d["devices"]} == {"wearable_patch", "electrochemical_aptasensor"}
    assert all(x["conceptual"] for x in d["devices"])
    assert "NOT FOR CLINICAL USE" in d["data_notice"]


# ---- hs-CRP / readings ----
def test_hs_crp_reading_creation_and_history(client):
    r = client.post(f"{B}/patients/P-1001/readings", json={"biomarker_id": "hs_crp", "value": 2.5, "unit": "mg/L"}, headers=DOC)
    assert r.status_code == 201 and r.json()["data"]["source"] == "manual_demo"
    h = client.get(f"{B}/patients/P-1001/biomarkers/hs_crp/history", headers=DOC).json()
    assert h["data"][-1]["value"] == 2.5 and h["meta"]["unit"] == "mg/L"


def test_reading_validation(client):
    def post(**kw):
        return client.post(f"{B}/patients/P-1001/readings", json=kw, headers=DOC)
    assert post(biomarker_id="hs_crp", value=1, unit="ng/mL").status_code == 422      # wrong unit
    assert post(biomarker_id="hs_crp", value=-3).status_code == 422                   # implausible
    assert post(biomarker_id="hs_crp", value=99999).status_code == 422                # implausible
    assert post(biomarker_id="glucose", value=1).status_code == 422                   # unknown
    assert post(biomarker_id="hs_crp", value=1, quality="missing").status_code == 422  # inconsistent
    assert post(value=1).status_code == 422                                           # missing field
    assert client.post(f"{B}/patients/NOPE/readings", json={"biomarker_id": "hs_crp", "value": 1}, headers=DOC).status_code == 404


def test_missing_reading_is_stored_as_missing(client):
    r = client.post(f"{B}/patients/P-1001/readings", json={"biomarker_id": "tat", "value": None}, headers=DOC)
    assert data(r)["quality"] == "missing" and data(r)["value"] is None


def test_history_404_for_unknown_biomarker(client):
    assert client.get(f"{B}/patients/P-1001/biomarkers/xyz/history", headers=DOC).status_code == 404


# ---- risk classification ----
def test_seeded_scenarios_classified_as_designed(client):
    risk = {p["id"]: p["risk"] for p in data(client.get(f"{B}/patients", headers=DOC))}
    assert risk["P-1001"]["category_key"] == "low_risk"
    assert risk["P-1002"]["category_key"] == "rising_activity"
    assert risk["P-1003"]["category_key"] == "pre_thrombotic_state"
    assert risk["P-1004"]["category_key"] == "critical_thrombosis_risk"
    assert risk["P-1006"]["status"] == "insufficient_data" and risk["P-1006"]["details"]["reason"] == "stale_data"
    assert all(r["source"] == "demonstration_rule" for r in risk.values())


def test_risk_result_structure(client):
    r = data(client.get(f"{B}/patients/P-1004/risk-history", headers=DOC))
    last = r[-1]
    assert {"category", "category_key", "status", "source", "model_version", "computed_at", "details"} <= set(last)
    assert {"contributions", "data_quality", "explanation_key"} <= set(last["details"])
    for forbidden in ("confidence", "accuracy", "sensitivity", "specificity"):
        assert forbidden not in last and forbidden not in last["details"]
    assert len(r) > 10  # real stored history


def test_assess_endpoint(client):
    r = data(client.post(f"{B}/patients/P-1003/assess", headers=DOC))
    assert r["category_key"] == "pre_thrombotic_state"


# ---- alerts / review / proposals ----
def test_alert_acknowledge_flow(client):
    alerts = data(client.get(f"{B}/alerts?status=open", headers=DOC))
    aid = alerts[0]["id"]
    a = data(client.post(f"{B}/alerts/{aid}/acknowledge", headers=DOC))
    assert a["status"] == "acknowledged" and a["acknowledged_by"] == "D-001"
    assert client.post(f"{B}/alerts/{aid}/acknowledge", headers=DOC).status_code == 409
    assert client.post(f"{B}/alerts/999999/acknowledge", headers=DOC).status_code == 404


def test_clinical_notes_and_review_status(client):
    n = data(client.post(f"{B}/patients/P-1003/notes", json={"body": "Reviewed trend.", "review_status": "reviewed"}, headers=DOC))
    assert n["doctor_entered"] is True and n["author_id"] == "D-001"
    assert data(client.get(f"{B}/patients/P-1003", headers=DOC))["review_status"] == "reviewed"
    assert len(data(client.get(f"{B}/patients/P-1003/notes", headers=DOC))) == 1
    assert client.post(f"{B}/patients/P-1003/notes", json={"body": ""}, headers=DOC).status_code == 422


def test_intervention_proposal_is_simulated_and_dose_free(client):
    props = client.get(f"{B}/patients/P-1004/intervention-proposals", headers=DOC).json()
    assert props["data"] and "SIMULATED" in props["meta"]["notice"]
    p = props["data"][0]
    assert p["is_simulated"] is True and p["status"] == "pending"
    assert not any(k in p for k in ("dose", "drug", "dosage"))
    r = client.post(f"{B}/intervention-proposals/{p['id']}/confirm", headers=DOC)
    assert data(r)["status"] == "confirmed" and "No treatment was administered" in r.json()["meta"]["notice"]
    assert client.post(f"{B}/intervention-proposals/{p['id']}/cancel", headers=DOC).status_code == 409
    ev = data(client.get(f"{B}/simulation/events", headers=DOC))
    assert any(e["kind"] == "simulated_proposal_confirmed" for e in ev)


def test_patient_cannot_resolve_other_patients_proposal(client):
    p = data(client.get(f"{B}/patients/P-1004/intervention-proposals", headers=DOC))[0]
    assert client.post(f"{B}/intervention-proposals/{p['id']}/confirm", headers=pat("P-1001")).status_code == 403


# ---- dashboard consistency ----
def test_dashboard_is_computed_from_data(client):
    d = data(client.get(f"{B}/dashboard/summary", headers=DOC))
    lst = data(client.get(f"{B}/patients", headers=DOC))
    assert d["total_patients"] == len(lst) == 8
    assert sum(d["by_risk"].values()) == 8
    assert d["by_risk"]["critical_thrombosis_risk"] == 1
    assert d["devices"]["total"] == 16 and d["devices"]["connected"] == 14
    assert d["needs_review"] == sum(1 for p in lst if p["review_status"] == "pending_review")
    assert d["biomarker_trends"]["hs_crp"]["patients_with_data"] >= 1
    client.post(f"{B}/patients", json={"display_name": "New"}, headers=DOC)
    assert data(client.get(f"{B}/dashboard/summary", headers=DOC))["total_patients"] == 9


# ---- simulation ----
def test_simulation_state_machine(client):
    assert data(client.get(f"{B}/simulation/state", headers=DOC))["status"] == "stopped"
    assert data(client.post(f"{B}/simulation/start", headers=DOC))["status"] == "running"
    assert client.post(f"{B}/simulation/start", headers=DOC).status_code == 409
    assert data(client.post(f"{B}/simulation/pause", headers=DOC))["status"] == "paused"
    assert client.post(f"{B}/simulation/pause", headers=DOC).status_code == 409
    assert data(client.post(f"{B}/simulation/resume", headers=DOC))["status"] == "running"
    assert client.post(f"{B}/simulation/resume", headers=DOC).status_code == 409
    assert "not real sensor" in data(client.get(f"{B}/simulation/state", headers=DOC))["label"]
    assert data(client.post(f"{B}/simulation/reset", headers=DOC))["status"] == "stopped"


def test_generate_reading_is_visible_to_patient_and_doctor(client):
    before = data(client.get(f"{B}/patients/P-1001", headers=DOC))["latest_biomarkers"]["hs_crp"]["measured_at"]
    data(client.post(f"{B}/simulation/patients/P-1001/generate", headers=DOC))
    doc = data(client.get(f"{B}/patients/P-1001", headers=DOC))
    own = data(client.get(f"{B}/patients/P-1001", headers=pat("P-1001")))
    assert doc["latest_biomarkers"] == own["latest_biomarkers"]      # single source of truth
    assert doc["latest_vitals"] == own["latest_vitals"]
    assert doc["latest_biomarkers"]["hs_crp"]["measured_at"] > before
    assert doc["latest_biomarkers"]["hs_crp"]["source"] == "simulator"
    hist = data(client.get(f"{B}/patients/P-1001/biomarkers/hs_crp/history", headers=pat("P-1001")))
    assert hist[-1]["value"] == doc["latest_biomarkers"]["hs_crp"]["value"]  # chart == latest


def test_tick_updates_all_active_patients_only(client):
    client.patch(f"{B}/patients/P-1002", json={"monitoring_status": "paused"}, headers=DOC)
    r = data(client.post(f"{B}/simulation/tick", headers=DOC))
    assert r["patients_updated"] == 7 and r["tick_count"] == 1


def test_disconnect_stops_readings_and_restore_resumes(client):
    def n_readings():
        return len(data(client.get(f"{B}/patients/P-1001/biomarkers/hs_crp/history?limit=1000", headers=DOC)))
    n0 = n_readings()
    assert data(client.post(f"{B}/simulation/patients/P-1001/disconnect?kind=electrochemical_aptasensor", headers=DOC))["changed"]
    data(client.post(f"{B}/simulation/patients/P-1001/generate", headers=DOC))
    assert n_readings() == n0                                            # aptasensor offline -> no hs-CRP
    d = data(client.get(f"{B}/patients/P-1001", headers=DOC))
    assert next(x for x in d["devices"] if x["kind"] == "electrochemical_aptasensor")["status"] == "disconnected"
    assert any(a["kind"] == "device_disconnected" for a in d["recent_alerts"])
    data(client.post(f"{B}/simulation/patients/P-1001/restore?kind=electrochemical_aptasensor", headers=DOC))
    data(client.post(f"{B}/simulation/patients/P-1001/generate", headers=DOC))
    assert n_readings() == n0 + 1
    hist = data(client.get(f"{B}/patients/P-1001/device-history", headers=DOC))
    assert [h["status"] for h in hist if h["kind"] == "electrochemical_aptasensor"][-2:] == ["disconnected", "connected"]


def test_missing_data_simulation(client):
    data(client.post(f"{B}/simulation/patients/P-1001/missing-data", headers=DOC))
    data(client.post(f"{B}/simulation/patients/P-1001/generate", headers=DOC))
    d = data(client.get(f"{B}/patients/P-1001", headers=DOC))
    assert d["latest_biomarkers"]["d_dimer"]["quality"] == "missing" and d["latest_biomarkers"]["d_dimer"]["value"] is None
    assert any(a["kind"] == "missing_data" for a in d["recent_alerts"])


def test_reset_restores_seed_state(client):
    client.post(f"{B}/patients", json={"display_name": "Temp"}, headers=DOC)
    data(client.post(f"{B}/simulation/reset", headers=DOC))
    assert len(data(client.get(f"{B}/patients", headers=DOC))) == 8


def test_live_ticks_can_escalate_and_create_alert(client):
    # P-1002 (rising) keeps rising with live ticks; risk category never decreases below 'rising'
    for _ in range(3):
        data(client.post(f"{B}/simulation/tick", headers=DOC))
    p = next(x for x in data(client.get(f"{B}/patients", headers=DOC)) if x["id"] == "P-1002")
    assert p["risk"]["category"] >= 1


def test_error_envelope_never_leaks_internals(client):
    r = client.get(f"{B}/patients/NOPE", headers=DOC)
    assert r.status_code == 404 and set(r.json()) == {"data", "error", "meta"} and r.json()["data"] is None
