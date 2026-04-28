"""Unit tests for the slew-time service and the /api/slew/compute router."""

import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.slew import (
    DEFAULT_CANT_DEG,
    axis_capability,
    crossover_angle_rad,
    eigenaxis_from_quaternions,
    eigenaxis_inertia,
    pyramid_wheel_axes,
    slew_time_eigenaxis,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# pyramid_wheel_axes
# ---------------------------------------------------------------------------


def test_pyramid_wheel_axes_default_shape_and_unit_norm() -> None:
    W = pyramid_wheel_axes(DEFAULT_CANT_DEG)
    assert W.shape == (3, 4)
    for i in range(4):
        assert np.linalg.norm(W[:, i]) == pytest.approx(1.0)


def test_pyramid_wheel_axes_default_cant_is_arctan_sqrt2() -> None:
    assert DEFAULT_CANT_DEG == pytest.approx(math.degrees(math.atan(math.sqrt(2.0))))
    W = pyramid_wheel_axes(DEFAULT_CANT_DEG)
    # Each Z component = cos(beta) = 1/sqrt(3) for beta = arctan(sqrt(2)).
    assert np.allclose(W[2, :], 1.0 / math.sqrt(3.0))


def test_pyramid_wheel_axes_xy_components_sum_to_zero() -> None:
    W = pyramid_wheel_axes(45.0)
    assert W[0, :].sum() == pytest.approx(0.0)
    assert W[1, :].sum() == pytest.approx(0.0)


def test_pyramid_wheel_axes_invalid_cant_rejected() -> None:
    with pytest.raises(ValueError):
        pyramid_wheel_axes(0.0)
    with pytest.raises(ValueError):
        pyramid_wheel_axes(90.0)
    with pytest.raises(ValueError):
        pyramid_wheel_axes(-5.0)
    with pytest.raises(ValueError):
        pyramid_wheel_axes(180.0)


# ---------------------------------------------------------------------------
# axis_capability
# ---------------------------------------------------------------------------


def test_axis_capability_along_z_is_4_cos_beta() -> None:
    """Along +Z, all four wheels contribute equally; capability = 4 cos(beta) * per-wheel."""
    beta_deg = 54.7356103172453
    W = pyramid_wheel_axes(beta_deg)
    cap = axis_capability(W, np.array([0.0, 0.0, 1.0]), per_wheel_max=1.0)
    expected = 4.0 * math.cos(math.radians(beta_deg))
    assert cap == pytest.approx(expected)


def test_axis_capability_along_x_is_2_sin_beta() -> None:
    """Along +X, only the φ=0 and φ=180° wheels contribute; capability = 2 sin(beta) * per-wheel."""
    beta_deg = 45.0
    W = pyramid_wheel_axes(beta_deg)
    cap = axis_capability(W, np.array([1.0, 0.0, 0.0]), per_wheel_max=1.0)
    expected = 2.0 * math.sin(math.radians(beta_deg))
    assert cap == pytest.approx(expected)


def test_axis_capability_scales_linearly_with_per_wheel_max() -> None:
    W = pyramid_wheel_axes(DEFAULT_CANT_DEG)
    e = np.array([1.0, 2.0, 3.0])
    cap1 = axis_capability(W, e, per_wheel_max=1.0)
    cap5 = axis_capability(W, e, per_wheel_max=5.0)
    assert cap5 == pytest.approx(5.0 * cap1)


def test_axis_capability_eigenaxis_normalised_internally() -> None:
    W = pyramid_wheel_axes(DEFAULT_CANT_DEG)
    cap_unit = axis_capability(W, np.array([0.0, 0.0, 1.0]), per_wheel_max=2.5)
    cap_scaled = axis_capability(W, np.array([0.0, 0.0, 7.0]), per_wheel_max=2.5)
    assert cap_unit == pytest.approx(cap_scaled)


def test_axis_capability_rejects_zero_axis_and_negative_max() -> None:
    W = pyramid_wheel_axes(DEFAULT_CANT_DEG)
    with pytest.raises(ValueError):
        axis_capability(W, np.zeros(3), per_wheel_max=1.0)
    with pytest.raises(ValueError):
        axis_capability(W, np.array([0.0, 0.0, 1.0]), per_wheel_max=-0.1)


# ---------------------------------------------------------------------------
# eigenaxis_inertia
# ---------------------------------------------------------------------------


def test_eigenaxis_inertia_along_principal_axis() -> None:
    I = np.diag([10.0, 20.0, 30.0])
    assert eigenaxis_inertia(I, np.array([1.0, 0.0, 0.0])) == pytest.approx(10.0)
    assert eigenaxis_inertia(I, np.array([0.0, 1.0, 0.0])) == pytest.approx(20.0)
    assert eigenaxis_inertia(I, np.array([0.0, 0.0, 1.0])) == pytest.approx(30.0)


def test_eigenaxis_inertia_diagonal_average_along_111() -> None:
    """For diag(I1, I2, I3) and ê = (1,1,1)/sqrt(3), I_eff = (I1+I2+I3)/3."""
    I = np.diag([1.0, 2.0, 3.0])
    e = np.array([1.0, 1.0, 1.0])
    assert eigenaxis_inertia(I, e) == pytest.approx((1.0 + 2.0 + 3.0) / 3.0)


def test_eigenaxis_inertia_symmetrises_input() -> None:
    """Slightly asymmetric I should still give a sensible scalar (uses (I+I^T)/2)."""
    I = np.array([[2.0, 0.1, 0.0], [0.0, 3.0, 0.0], [0.0, 0.0, 4.0]])
    val = eigenaxis_inertia(I, np.array([1.0, 0.0, 0.0]))
    assert val == pytest.approx(2.0)


# ---------------------------------------------------------------------------
# slew_time_eigenaxis
# ---------------------------------------------------------------------------


def test_slew_time_torque_limited_triangular() -> None:
    """Small slew where wheels never reach momentum cap → t = 2 sqrt(theta I / tau)."""
    I, tau, h, theta = 100.0, 0.5, 10.0, 0.1
    res = slew_time_eigenaxis(theta, I, tau, h)
    assert res.regime == "torque_limited"
    assert res.slew_time_s == pytest.approx(2.0 * math.sqrt(theta * I / tau))
    # Peak rate from triangular profile: sqrt(theta*tau/I)
    assert res.peak_rate_rad_s == pytest.approx(math.sqrt(theta * tau / I))


def test_slew_time_momentum_limited_trapezoidal() -> None:
    """Large slew where wheels saturate at h → t = theta I / h + h / tau."""
    I, tau, h, theta = 100.0, 0.5, 1.0, 1.0
    res = slew_time_eigenaxis(theta, I, tau, h)
    assert res.regime == "momentum_limited"
    expected = theta * I / h + h / tau
    assert res.slew_time_s == pytest.approx(expected)
    assert res.peak_rate_rad_s == pytest.approx(h / I)


def test_slew_time_zero_angle_returns_zero() -> None:
    res = slew_time_eigenaxis(0.0, 100.0, 0.5, 10.0)
    assert res.regime == "zero"
    assert res.slew_time_s == 0.0
    assert res.peak_rate_rad_s == 0.0


def test_slew_time_infeasible_when_no_capability() -> None:
    res = slew_time_eigenaxis(0.5, 100.0, 0.0, 10.0)
    assert res.regime == "infeasible"
    assert math.isinf(res.slew_time_s)
    res2 = slew_time_eigenaxis(0.5, 100.0, 0.5, 0.0)
    assert res2.regime == "infeasible"


def test_slew_time_negative_inputs_rejected() -> None:
    with pytest.raises(ValueError):
        slew_time_eigenaxis(-0.1, 100.0, 0.5, 10.0)
    with pytest.raises(ValueError):
        slew_time_eigenaxis(0.5, 0.0, 0.5, 10.0)


def test_slew_time_continuous_at_crossover() -> None:
    """Triangular and trapezoidal formulas must agree at the crossover angle."""
    I, tau, h = 200.0, 0.4, 5.0
    theta_x = crossover_angle_rad(I, tau, h)
    eps = theta_x * 1e-6
    below = slew_time_eigenaxis(theta_x - eps, I, tau, h)
    above = slew_time_eigenaxis(theta_x + eps, I, tau, h)
    assert below.regime == "torque_limited"
    assert above.regime == "momentum_limited"
    assert below.slew_time_s == pytest.approx(above.slew_time_s, rel=1e-4)


# ---------------------------------------------------------------------------
# eigenaxis_from_quaternions
# ---------------------------------------------------------------------------


def test_eigenaxis_from_quaternions_identity() -> None:
    e, ang = eigenaxis_from_quaternions(
        np.array([1.0, 0.0, 0.0, 0.0]), np.array([1.0, 0.0, 0.0, 0.0])
    )
    assert ang == pytest.approx(0.0)


def test_eigenaxis_from_quaternions_90_deg_about_z() -> None:
    qi = np.array([1.0, 0.0, 0.0, 0.0])
    qf = np.array([math.cos(math.pi / 4.0), 0.0, 0.0, math.sin(math.pi / 4.0)])
    e, ang = eigenaxis_from_quaternions(qi, qf)
    assert ang == pytest.approx(math.pi / 2.0)
    assert np.allclose(e, [0.0, 0.0, 1.0])


def test_eigenaxis_from_quaternions_takes_shortest_path() -> None:
    """A 270° rotation should be reported as a 90° rotation in the opposite sense."""
    qi = np.array([1.0, 0.0, 0.0, 0.0])
    # 270° about +Z
    qf = np.array(
        [math.cos(3.0 * math.pi / 4.0), 0.0, 0.0, math.sin(3.0 * math.pi / 4.0)]
    )
    e, ang = eigenaxis_from_quaternions(qi, qf)
    assert ang == pytest.approx(math.pi / 2.0)
    assert np.allclose(e, [0.0, 0.0, -1.0])


# ---------------------------------------------------------------------------
# Router: POST /api/slew/compute
# ---------------------------------------------------------------------------


def test_slew_compute_eigenaxis_mode_happy_path() -> None:
    """30° slew about +Z with a balanced pyramid; check regime + closed-form values."""
    payload = {
        "total_inertia_kgm2": {"ixx": 1000.0, "iyy": 1500.0, "izz": 1800.0},
        "wheel_array": {
            "max_torque_per_wheel_nm": 0.2,
            "max_momentum_per_wheel_nms": 12.0,
        },
        "maneuver": {
            "mode": "eigenaxis_angle",
            "eigenaxis": [0.0, 0.0, 1.0],
            "angle_deg": 30.0,
        },
    }
    r = client.post("/api/slew/compute", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()

    # +Z with default cant (54.7356°): cos(beta) = 1/sqrt(3); axis cap = 4/sqrt(3) * per-wheel.
    expected_tau = 4.0 / math.sqrt(3.0) * 0.2
    expected_h = 4.0 / math.sqrt(3.0) * 12.0
    assert body["effective_inertia_kgm2"] == pytest.approx(1800.0)
    assert body["axis_max_torque_nm"] == pytest.approx(expected_tau)
    assert body["axis_max_momentum_nms"] == pytest.approx(expected_h)

    theta = math.radians(30.0)
    omega_tri = math.sqrt(theta * expected_tau / 1800.0)
    h_tri = 1800.0 * omega_tri
    if h_tri <= expected_h:
        assert body["regime"] == "torque_limited"
        assert body["slew_time_s"] == pytest.approx(
            2.0 * math.sqrt(theta * 1800.0 / expected_tau)
        )
    else:
        assert body["regime"] == "momentum_limited"

    assert len(body["curve"]) == 60
    assert body["curve"][0]["angle_deg"] == pytest.approx(0.0)
    assert body["curve"][0]["slew_time_s"] == pytest.approx(0.0)


def test_slew_compute_quaternion_pair_mode() -> None:
    payload = {
        "total_inertia_kgm2": {"ixx": 500.0, "iyy": 500.0, "izz": 500.0},
        "wheel_array": {
            "max_torque_per_wheel_nm": 0.1,
            "max_momentum_per_wheel_nms": 5.0,
        },
        "maneuver": {
            "mode": "quaternion_pair",
            "q_initial": [1.0, 0.0, 0.0, 0.0],
            "q_final": [
                math.cos(math.pi / 4.0),
                0.0,
                0.0,
                math.sin(math.pi / 4.0),
            ],
        },
    }
    r = client.post("/api/slew/compute", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["slew_angle_deg"] == pytest.approx(90.0)
    assert body["eigenaxis_unit"] == pytest.approx([0.0, 0.0, 1.0])
    assert body["effective_inertia_kgm2"] == pytest.approx(500.0)
    assert body["regime"] in ("torque_limited", "momentum_limited")


def test_slew_compute_rejects_out_of_range_angle() -> None:
    payload = {
        "total_inertia_kgm2": {"ixx": 100.0, "iyy": 100.0, "izz": 100.0},
        "wheel_array": {
            "max_torque_per_wheel_nm": 0.1,
            "max_momentum_per_wheel_nms": 1.0,
        },
        "maneuver": {
            "mode": "eigenaxis_angle",
            "eigenaxis": [1.0, 0.0, 0.0],
            "angle_deg": 250.0,
        },
    }
    r = client.post("/api/slew/compute", json=payload)
    assert r.status_code == 422


def test_slew_compute_rejects_missing_quaternion() -> None:
    payload = {
        "total_inertia_kgm2": {"ixx": 100.0, "iyy": 100.0, "izz": 100.0},
        "wheel_array": {
            "max_torque_per_wheel_nm": 0.1,
            "max_momentum_per_wheel_nms": 1.0,
        },
        "maneuver": {
            "mode": "quaternion_pair",
            "q_initial": [1.0, 0.0, 0.0, 0.0],
        },
    }
    r = client.post("/api/slew/compute", json=payload)
    assert r.status_code == 422


def test_slew_compute_custom_cant_changes_capability() -> None:
    """A larger cant angle gives more X capability and less Z capability."""
    base = {
        "total_inertia_kgm2": {"ixx": 100.0, "iyy": 100.0, "izz": 100.0},
        "wheel_array": {
            "max_torque_per_wheel_nm": 1.0,
            "max_momentum_per_wheel_nms": 1.0,
            "cant_angle_deg": 30.0,
        },
        "maneuver": {
            "mode": "eigenaxis_angle",
            "eigenaxis": [1.0, 0.0, 0.0],
            "angle_deg": 10.0,
        },
    }
    r1 = client.post("/api/slew/compute", json=base)
    base["wheel_array"]["cant_angle_deg"] = 75.0
    r2 = client.post("/api/slew/compute", json=base)
    assert r1.status_code == 200 and r2.status_code == 200
    # 2 sin(75°) > 2 sin(30°), so the steeper cant gives more X-axis torque.
    assert r2.json()["axis_max_torque_nm"] > r1.json()["axis_max_torque_nm"]
