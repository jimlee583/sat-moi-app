# sat-moi-app

Aggregate a satellite's **moment of inertia (MOI)** tensor from a base SV
tensor and an arbitrary number of deployables (solar arrays, antennas, booms,
reflectors, …), applying the **parallel-axis theorem** to shift each
deployable's local inertia to the SV reference point.

Inputs can be entered in either **SI** (`kg·m²`, `kg`, `m`) or **English**
engineering units (`slug·ft²`, `slug`, `ft`); the app converts to SI
internally, performs the math, and displays results in whichever system is
currently selected.

The dev/build environment mirrors `sat-solar-beta-app`: FastAPI + `uv`
backend, Vite + React 19 + TypeScript frontend, Dockerfile for Cloud Run,
and Firebase Hosting for the UI.

## Layout

```
sat-moi-app/
  backend/                FastAPI + uv + numpy + pydantic
    app/
      main.py             FastAPI app, CORS, /health
      models.py           Pydantic request/response models
      routers/moi.py      POST /api/moi/compute
      services/
        inertia.py        Tensor build, parallel-axis, eigendecomp
        units.py          SI <-> English helpers
    tests/                pytest + httpx (28 tests)
    Dockerfile            Cloud Run-ready multi-stage build
    pyproject.toml
  frontend/               Vite 6 + React 19 + TypeScript 5.7
    src/
      App.tsx             Top-level state + layout
      api/
        client.ts         fetch wrapper with VITE_API_BASE_URL support
        moi.ts            typed POST /api/moi/compute
      components/
        UnitToggle.tsx
        BaseSVPanel.tsx
        DeployablesTable.tsx
        ResultsCards.tsx
      types/moi.ts        Shared request/response + unit conversion helpers
    firebase.json         Firebase Hosting config
    vite.config.ts        Dev proxy /api -> localhost:8006
```

## Local development

Ports: backend on `8006`, frontend on `5173`. (The sibling `sat-solar-beta-app`
uses `8005`, so both can run side by side.)

### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8006
```

Once running:

- `GET  http://localhost:8006/health`
- `POST http://localhost:8006/api/moi/compute`
- OpenAPI docs: `http://localhost:8006/docs`

Run the tests:

```bash
cd backend
uv run pytest -v
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev proxy forwards `/api/*` to the backend on
`8006`, so no `.env` file is needed in development.

Production build:

```bash
cd frontend
npm run build      # tsc -b && vite build -> dist/
npm run preview    # serve dist/ locally
```

## API

### `POST /api/moi/compute`

Everything on the wire is **SI** (the frontend converts before sending). All
inertia components are `kg·m²`, masses `kg`, offsets `m`.

Request body:

```jsonc
{
  "sv": {
    "ixx": 1000.0, "iyy": 1500.0, "izz": 1800.0,
    "ixy": 0.0,    "ixz": 0.0,    "iyz": 0.0
  },
  "sv_mass_kg": 500.0,            // optional, informational
  "deployables": [
    {
      "name": "+Y solar wing",
      "mass_kg": 12.0,
      "offset_m": [0.0, 2.5, 0.0],
      "inertia": {
        "ixx": 3.0, "iyy": 0.2, "izz": 3.0,
        "ixy": 0.0, "ixz": 0.0, "iyz": 0.0
      },
      "already_about_sv_ref": false
    }
  ]
}
```

- `already_about_sv_ref = false` (default): `inertia` is taken about the
  deployable's own CG; the app applies
  `I_shifted = I_local + m * ((r·r) I₃ - r ⊗ r)` before summing.
- `already_about_sv_ref = true`: `inertia` is already taken about the SV
  reference point, so it's summed directly (mass and offset are still recorded
  for the total-mass field but not used in the MOI math).

Response:

```jsonc
{
  "total_inertia_kgm2": {
    "ixx": 1078.0, "iyy": 1500.2, "izz": 1878.0,
    "ixy": 0.0,    "ixz": 0.0,    "iyz": 0.0
  },
  "total_mass_kg": 512.0,
  "principal_moments_kgm2": [1078.0, 1500.2, 1878.0],   // ascending
  "principal_axes": [
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0]
  ]
}
```

## Unit conversions (exact)

| From | To | Factor |
|---|---|---|
| `slug·ft²` | `kg·m²` | `1.3558179483314004` |
| `slug` | `kg` | `14.59390293720636` |
| `ft` | `m` | `0.3048` |

These are defined in both `backend/app/services/units.py` and
`frontend/src/types/moi.ts` so the frontend (which performs the on-the-wire
conversion) and any scripted client share the same source of truth.

## Deployment (future, not wired up yet)

- **Backend → Cloud Run**: the `backend/Dockerfile` mirrors the solar app's
  multi-stage build and listens on `$PORT` (defaults to 8080). Build with
  `gcloud builds submit --tag ...` and deploy with `gcloud run deploy`.
- **Frontend → Firebase Hosting**: `frontend/.firebaserc` points at a Firebase
  project named `sat-moi-app`. Create (or alias) the project, then run
  `firebase login && npm run deploy` from `frontend/`. Once the backend has a
  Cloud Run URL, create `frontend/.env.production` with
  `VITE_API_BASE_URL=https://...` before running `npm run build`.
- Update the CORS allow-list in `backend/app/main.py` if your Firebase
  project or Cloud Run URLs differ from the defaults.
