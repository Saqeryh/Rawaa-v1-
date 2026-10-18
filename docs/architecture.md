# Architecture
```
Wearable simulator -> ingest service (validation) -> DB -> AI module -> risk assessment -> alerts / proposals
                                                     |
                                                  REST API
                                        /                          \
                              Patient app (own data)       Doctor dashboard (all data)
```
* **Single source of truth:** both UIs read the same tables through the same API; the simulator writes nowhere else.
* **Central configuration:** `backend/app/core/biomarkers.py` holds ids, en/ar/ko names, units (override with `UNIT_<ID>`), sensor association, plausibility bounds. `GET /api/v1/config` publishes it to the frontends.
* **AI module (`ai/`)** has no backend dependency. `assess()` takes `AssessmentInput`, returns `AssessmentResult`; `demo_rule` today, `lstm` raises `ModelNotAvailableError`.
* **Provenance:** every assessment stores `source` (`demonstration_rule` | `synthetic_model` | `trained_model`) and `model_version`; UIs must display it.
* **Response envelope:** `{data, error, meta}` for every endpoint, including errors.
* **Database:** SQLAlchemy 2; SQLite locally, PostgreSQL/Supabase via `DATABASE_URL`. Tables: patients, doctors, devices, device_status_log, biomarker_readings, vital_signs, risk_assessments, alerts, clinical_notes, intervention_proposals, simulation_events, user_preferences.
* **Roles:** `doctor` (all patients) and `patient` (own record only), enforced server-side in `api/deps.py`.

## Path from demo rule to a real LSTM
1. Obtain a clinically labelled, ethically approved dataset. 2. Implement resampling/normalisation/masking in `ai/preprocessing`. 3. Train `ThrombiXLSTM` (`ai/training/lstm_model.py`, LSTM -> Dense -> softmax) and evaluate prospectively. 4. Add a `trained_model` backend to `ai/inference/service.py` returning the same `AssessmentResult`. The API and UI stay unchanged except for the displayed `source`.
