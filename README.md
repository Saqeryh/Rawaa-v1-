# رواء | RAWA · ThrombiX — connected demonstration platform

**Research and demonstration prototype. DEMO DATA — SYNTHETIC PATIENTS — NOT FOR CLINICAL USE.**
Not a medical device, no regulatory status, no clinical validation. Read `docs/limitations.md`.

## What is in the repository
| Part | Location | State |
|---|---|---|
| AI module: schemas, windowing, **demonstration rule engine**, untrained LSTM sketch | `ai/` | Done, tested |
| Backend: FastAPI, SQLAlchemy, seed data, simulator, dev auth (34 operations) | `backend/` | Done, tested |
| Frontend (React + TypeScript): landing page, doctor dashboard, patient mobile web app, ar/en/ko | `frontend/web/` | Done, tested |
| Flutter patient app | — | Not built (the patient app is a mobile-first **web** app) |
| docker-compose, Supabase Auth/Realtime | — | Not included (not verifiable here) |

The original single-file prototype is kept in `docs/original-prototype.html.txt`; the logo is `assets/logo/rawaa.png`.

## Prerequisites
Python 3.11+ (tested on 3.12), Node.js 18+ (tested on 22) and npm.

## 1. Backend (terminal A)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
PYTHONPATH=.:.. python -m uvicorn app.main:app --port 8000   # PowerShell: $env:PYTHONPATH=".;.."
```
The first start creates `rawa_demo.db` (SQLite) and seeds 8 fictional patients. API docs: http://localhost:8000/docs
Use **one** server worker (simulation state is in-process). Configuration: copy `.env.example` (all variables optional).

## 2. Frontend (terminal B)
```bash
cd frontend/web
npm install
npm run dev            # http://localhost:5173  (proxies /api to http://localhost:8000)
```
Open http://localhost:5173 and choose the **doctor dashboard** or the **patient app**. Sign-in is a *development* sign-in
(built-in demo tokens, see `docs/limitations.md`). Use the language buttons for العربية / English / 한국어.
Production build: `npm run build` (output in `frontend/web/dist`).

## 3. Demo script (5 minutes)
1. Doctor → **Overview**: statistics are computed from the database. Open **Patients**, filter by risk, open *Yousef Al-Amri*.
2. Patient detail: 4 biomarkers (incl. **hs-CRP** via the *simulated* Electrochemical Aptasensor), 4 vitals, risk panel (origin: demonstration rule), alerts, simulated proposal (confirmation dialog), doctor notes.
3. Doctor → **Simulation** → *Start*. Readings arrive; *Pause* stops them, *Resume* continues, *Reset* restores the seed data.
4. In another browser window sign in as the **patient** *Yousef Al-Amri* (P-1004): the same readings, timestamps and classification appear.
5. Simulation → choose a patient → *Disconnect* the aptasensor / *Simulate missing data*: gaps and warnings appear (never zeros).
6. Switch language to Arabic: the whole UI and layout mirror to right-to-left.

## Tests
```bash
# backend + AI (from the repository root)
python -m pytest                                  # 52 passed, 1 skipped (PyTorch not installed)

# frontend (from frontend/web)
npm run typecheck && npm test                     # component tests with a mocked HTTP layer
npm run build

# frontend against the REAL backend (start the backend first, ideally with SIM_INTERVAL_SECONDS=1)
RAWA_API=http://127.0.0.1:8000/api/v1 npm run test:e2e
# PowerShell: $env:RAWA_E2E=1; $env:RAWA_API="http://127.0.0.1:8000/api/v1"; npx vitest run src/test/integration.test.tsx
```
`test:e2e` **resets the database** to the seed data. Do not point it at data you want to keep.

## Deployment

### Vercel Multi-Services (Recommended)

A root-level `vercel.json` is configured for Vercel's Multi-Services architecture:

- **backend** service (root: `backend`, Python/FastAPI) - handles API routes under `/api/*`
- **web** service (root: `frontend/web`, Vite/React) - serves the frontend application
- Internal binding `BACKEND_PRIVATE_URL` connects web to backend securely
- Routes: `/api/(.*)` → backend, `/(.*)` → web (SPA fallback)

**Environment Variables (Vercel):**
- Backend service: `DATABASE_URL`, `APP_ENV=production`, `CORS_ORIGINS`, `SEED_ON_START`, etc.
- Web service: `VITE_API_URL` (set to `/api/v1` or use relative paths; client-side requests go through `/api/`)

**Runtime usage:**
- Client-side (browser): Use relative `/api/*` paths - the frontend API client already defaults to `/api/v1`.
- Server-side (if needed): Use `process.env.BACKEND_PRIVATE_URL` for internal service-to-service calls.

**Local Testing with Vercel CLI:**
```bash
vercel dev --debug
```

### Alternative: Separate Deployments

#### Frontend (Vercel)
1. Push this repository to GitHub.
2. Import the project in [Vercel](https://vercel.com/).
3. Set Root Directory to `frontend/web`.
4. Framework Preset: `Vite` (auto-detected).
5. Build Command: `npm run build`.
6. Output Directory: `dist`.
7. Add environment variables:
   - `VITE_API_URL`: URL of your deployed backend API (e.g., `https://your-backend.onrender.com/api/v1`)

The frontend uses React Router; Vercel will need SPA routing. The Vite build output works with Vercel's default configuration for SPA.

#### Backend
SQLite file-based databases are not persistent in serverless environments. For production deployment, use a managed PostgreSQL database and set `DATABASE_URL` accordingly.

Recommended hosting options: [Render](https://render.com/), [Railway](https://railway.app/), [Fly.io](https://fly.io/), or [Heroku](https://www.heroku.com/). Vercel can run Python serverless functions but may have limitations for long-running processes; consider the requirements.

Required environment variables:
- `APP_ENV=production`
- `DATABASE_URL` (PostgreSQL URL)
- `AUTH_MODE=dev` (demo only - not for production medical use)
- `CORS_ORIGINS` (comma-separated frontend URLs, e.g., `https://your-app.vercel.app`)
- `SEED_ON_START` (set appropriately - avoid seeding in production with existing data)

### Environment Variables
- Backend: Copy `.env.example` to `.env` locally, never commit real secrets.
- Frontend: Copy `frontend/web/.env.example` to `frontend/web/.env.local` locally.

## Known limitations
See `docs/limitations.md`. In short: synthetic data only; the risk category is a demonstration rule with arbitrary parameters (no confidence or accuracy exists); the aptasensor is conceptual; no medication/dose logic exists; dev-only authentication; layout was verified in jsdom, not by visual inspection in a browser.
