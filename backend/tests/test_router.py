"""End-to-end tests for the /api/moi/compute router."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_compute_base_only_returns_sv_tensor() -> None:
    payload = {
        "sv": {"ixx": 100.0, "iyy": 200.0, "izz": 300.0},
        "sv_mass_kg": 500.0,
        "deployables": [],
    }
    r = client.post("/api/moi/compute", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    tot = body["total_inertia_kgm2"]
    assert tot["ixx"] == pytest.approx(100.0)
    assert tot["iyy"] == pytest.approx(200.0)
    assert tot["izz"] == pytest.approx(300.0)
    assert tot["ixy"] == pytest.approx(0.0)
    assert body["total_mass_kg"] == pytest.approx(500.0)
    # Principal moments of a diagonal tensor match the sorted diagonal.
    assert body["principal_moments_kgm2"] == pytest.approx([100.0, 200.0, 300.0])


def test_compute_with_deployable_parallel_axis() -> None:
    """Point mass of 10 kg at (2,0,0) should add 40 kg·m² to Iyy and Izz."""
    payload = {
        "sv": {"ixx": 100.0, "iyy": 200.0, "izz": 300.0},
        "sv_mass_kg": 500.0,
        "deployables": [
            {
                "name": "point_mass_x",
                "mass_kg": 10.0,
                "offset_m": [2.0, 0.0, 0.0],
                "inertia": {"ixx": 0.0, "iyy": 0.0, "izz": 0.0},
                "already_about_sv_ref": False,
            }
        ],
    }
    r = client.post("/api/moi/compute", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    tot = body["total_inertia_kgm2"]
    assert tot["ixx"] == pytest.approx(100.0)
    assert tot["iyy"] == pytest.approx(240.0)
    assert tot["izz"] == pytest.approx(340.0)
    assert body["total_mass_kg"] == pytest.approx(510.0)


def test_compute_with_already_shifted_deployable() -> None:
    """already_about_sv_ref=True means just sum the tensor as-is."""
    payload = {
        "sv": {"ixx": 10.0, "iyy": 20.0, "izz": 30.0},
        "deployables": [
            {
                "mass_kg": 5.0,
                "offset_m": [100.0, 100.0, 100.0],
                "inertia": {"ixx": 1.0, "iyy": 2.0, "izz": 3.0},
                "already_about_sv_ref": True,
            }
        ],
    }
    r = client.post("/api/moi/compute", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    tot = body["total_inertia_kgm2"]
    assert tot["ixx"] == pytest.approx(11.0)
    assert tot["iyy"] == pytest.approx(22.0)
    assert tot["izz"] == pytest.approx(33.0)


def test_compute_rejects_negative_mass() -> None:
    payload = {
        "sv": {"ixx": 1.0, "iyy": 1.0, "izz": 1.0},
        "deployables": [
            {
                "mass_kg": -1.0,
                "offset_m": [0.0, 0.0, 0.0],
                "inertia": {"ixx": 0.0, "iyy": 0.0, "izz": 0.0},
            }
        ],
    }
    r = client.post("/api/moi/compute", json=payload)
    assert r.status_code == 422
