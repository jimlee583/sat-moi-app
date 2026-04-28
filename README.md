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

## Math

All vectors and tensors below are expressed in the **SV body frame** (the same
frame the base SV tensor is given in), and the **reference point** is the SV
reference point chosen by the user (typically the SV CG or a geometric
reference). All quantities are SI (`kg`, `m`, `kg·m²`).

### 1. The inertia tensor

Each rigid body is described by a symmetric `3 × 3` inertia tensor about a
particular reference point:

$$
I \;=\;
\begin{bmatrix}
I_{xx} & I_{xy} & I_{xz} \\
I_{xy} & I_{yy} & I_{yz} \\
I_{xz} & I_{yz} & I_{zz}
\end{bmatrix}
\;=\; I^{T}
$$

The diagonal entries are the moments of inertia about the body axes and the
off-diagonal entries are the products of inertia. Because $I$ is symmetric,
only six independent components are stored on the wire (`ixx`, `iyy`, `izz`,
`ixy`, `ixz`, `iyz`).

### 2. Parallel-axis shift for each deployable

A deployable is supplied with its inertia tensor $I_{\text{local}}$ taken about
its **own center of mass**, its mass $m$, and the offset vector $\mathbf{r}$
from the SV reference point to the deployable's CG. To re-express that inertia
about the SV reference point we apply the tensor form of the parallel-axis
theorem:

$$
I_{\text{shifted}} \;=\; I_{\text{local}} \;+\; m\,\Big( (\mathbf{r}\cdot\mathbf{r})\,\mathbf{I}_{3} \;-\; \mathbf{r}\otimes\mathbf{r} \Big)
$$

where $\mathbf{I}_{3}$ is the `3 × 3` identity matrix and
$\mathbf{r}\otimes\mathbf{r}$ is the outer product $\mathbf{r}\,\mathbf{r}^{T}$.
Written component-wise with $\mathbf{r} = (r_x, r_y, r_z)$ and
$r^{2} = r_x^{2} + r_y^{2} + r_z^{2}$:

$$
m\Big( r^{2}\mathbf{I}_{3} - \mathbf{r}\mathbf{r}^{T} \Big) \;=\;
m
\begin{bmatrix}
r_y^{2}+r_z^{2} & -r_x r_y & -r_x r_z \\
-r_x r_y & r_x^{2}+r_z^{2} & -r_y r_z \\
-r_x r_z & -r_y r_z & r_x^{2}+r_y^{2}
\end{bmatrix}
$$

This added term is the inertia of a point mass $m$ located at $\mathbf{r}$
about the SV reference point, and adding it converts $I_{\text{local}}$ from
"about the deployable CG" to "about the SV reference point".

If the request flag `already_about_sv_ref` is `true`, the supplied tensor is
assumed to already be about the SV reference point and the parallel-axis term
is **not** applied — the tensor is summed in directly.

### 3. Total inertia tensor

With $I_{\text{SV}}$ the base SV tensor (already about the SV reference point)
and a set of $N$ deployables indexed by $k$, the aggregate inertia tensor about
the SV reference point is the sum

$$
I_{\text{total}} \;=\; I_{\text{SV}} \;+\; \sum_{k=1}^{N} I_{\text{shifted},k}
$$

This is what the API returns as `total_inertia_kgm2`. Total mass is the simple
scalar sum

$$
m_{\text{total}} \;=\; m_{\text{SV}} \;+\; \sum_{k=1}^{N} m_{k}.
$$

### 4. Principal moments and principal axes

The principal moments of inertia are the eigenvalues of $I_{\text{total}}$ and
the principal axes are the corresponding orthonormal eigenvectors. They satisfy
the standard eigenvalue problem

$$
I_{\text{total}}\, \mathbf{v}_i \;=\; \lambda_i\, \mathbf{v}_i, \qquad i = 1, 2, 3
$$

with $\lambda_1 \le \lambda_2 \le \lambda_3$ and
$\mathbf{v}_i \cdot \mathbf{v}_j = \delta_{ij}$. Equivalently, there exists an
orthogonal matrix $V = [\,\mathbf{v}_1\;\mathbf{v}_2\;\mathbf{v}_3\,]$ that
diagonalizes the tensor:

$$
V^{T}\, I_{\text{total}}\, V \;=\;
\begin{bmatrix}
\lambda_1 & 0 & 0 \\
0 & \lambda_2 & 0 \\
0 & 0 & \lambda_3
\end{bmatrix}.
$$

Because $I_{\text{total}}$ is real and symmetric, the eigenvalues are real and
the eigenvectors are mutually orthogonal. The backend computes them with
`numpy.linalg.eigh` (which assumes a symmetric / Hermitian operand) after
explicitly symmetrizing $I_{\text{total}}$ via
$\tfrac{1}{2}(I_{\text{total}} + I_{\text{total}}^{T})$ to suppress any
floating-point asymmetry. Each returned eigenvector is sign-normalized so its
largest-magnitude component is positive — eigenvectors are only defined up to a
sign, and this convention keeps the response deterministic across platforms.

In the API response, `principal_moments_kgm2` is the ascending tuple
$(\lambda_1, \lambda_2, \lambda_3)$ and `principal_axes[i]` is the unit vector
$\mathbf{v}_i$ expressed in the SV body frame.

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
