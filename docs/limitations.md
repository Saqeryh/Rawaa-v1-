# Limitations and safety statements
## Clinical
* All patients, readings, alerts and notes are synthetic. Nothing was measured on a person.
* The risk category comes from a **demonstration rule** (`ai/inference/demo_rule.py`) with **arbitrary** parameters. It is not a trained model, not validated, and does not predict real thrombosis. No confidence, accuracy, sensitivity or specificity exists and none is shown.
* Units are configurable placeholders; **no clinical reference ranges or thresholds** are defined (`reference_range = null`). Validation bounds only reject implausible input.
* hs-CRP is a supporting inflammatory marker: stored and shown, **not used by the rule**, never a standalone thrombosis indicator.
* The **Electrochemical Aptasensor** is a conceptual/simulated sensor (`conceptual=true`). No detection limit, continuity or experimental validation is claimed.
* Interventions: only a **simulated** proposal -> confirm/cancel workflow with an audit trail. No drug, dose, pump control or administration exists in the code, schema or API.
## Security
* Auth is **development-only** (fixed bearer tokens). Role checks are real; the identity provider is not. Production needs Supabase Auth/OIDC, HTTPS, rate limiting, audit logging and secret management.
* `GET /dev/tokens` exists only when `AUTH_MODE=dev` and `APP_ENV != production`.
* No regulatory or health-data-law compliance is claimed.
## Technical
* Simulation state is in-process (single worker). Use one Uvicorn worker for the demo.
* Live scenarios restart every 48 steps so synthetic values stay bounded.

## Frontend
* The UI shows the origin of every classification ("Demonstration rule (not a trained model)") and never shows confidence, accuracy, sensitivity or specificity.
* Missing readings render as "No reading" and as gaps in charts, never as 0.
* The assistant is a fixed, keyword-based answer set (`frontend/web/src/assistant/knowledge.ts`), not a medical AI. It refuses medication/dose questions, points to emergency services for emergencies and declines to diagnose. Keyword matching is simple: unusual phrasings fall back to a "no answer" message.
* Patients cannot change wearable connection state (simulation endpoints are doctor-only); the patient app only displays it.
* Language changes are saved to the patient's server-side preference only while the Settings page is open.
* Development sign-in stores demo tokens in `sessionStorage`. Real deployments need an identity provider.
* Korean text uses system fonts (IBM Plex Sans Arabic has no Hangul glyphs).
* Layout, RTL mirroring and chart rendering were checked structurally in jsdom (charts do not render there) and by production build, **not** by visual inspection in a browser or on real devices.
