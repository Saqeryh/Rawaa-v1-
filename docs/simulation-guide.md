# Simulation guide
Scenarios (`backend/app/simulation/generator.py`): `stable`, `rising`, `pre_thrombotic`, `critical`, `missing_data`, `disconnected`, `pending_review`. Values are deterministic per (patient, step), labelled `synthetic_seed` (history) or `simulator` (live).
* Continuous: `POST /simulation/start` (every `SIM_INTERVAL_SECONDS`), `pause`, `resume`, `reset` (restores the seed dataset).
* Manual: `POST /simulation/tick` (all active patients) or `/simulation/patients/{id}/generate`.
* Faults: `/disconnect?kind=wearable_patch|electrochemical_aptasensor`, `/restore`, `/missing-data` (next reading has null biomarkers).
* Every action is recorded in `GET /simulation/events`. UIs must show "Simulated updates — not real sensor measurements".
