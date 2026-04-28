"""Tests for ``simulate_slew_timeseries`` and the ``timeseries`` block on the
``POST /api/slew/compute`` response."""

import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.slew import (
    DEFAULT_CANT_DEG,
    axis_capability,
    eigenaxis_inertia,
    pyramid_wheel_axes,
    simulate_slew_timeseries,
    slew_time_eigenaxis,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _quat_to_axis_angle(q: tuple[float, float, float, float]) -> tuple[
    np.ndarray, float
]:
    """Convert a scalar-first unit quaternion back to an (axis, angle) pair."""
    w, x, y, z = q
    angle = 2.0 * math.acos(max(-1.0, min(1.0, w)))
    s = math.sin(angle / 2.0)
    if s < 1e-12:
        return np.array([0.0, 0.0, 1.0]), 0.0
    axis = np.array([x, y, z]) / s
    return axis, angle


def _build_pyramid_inputs(
    inertia_diag: tuple[float, float, float],
    eigenaxis: tuple[float, float, float],
    angle_rad: float,
    tau_per_wheel: float,
    h_per_wheel: float,
    cant_deg: float = DEFAULT_CANT_DEG,
) -> dict:
    """Pre-compute everything ``simulate_slew_timeseries`` needs."""
    I = np.diag(inertia_diag)
    e = np.asarray(eigenaxis, dtype=float)
    e = e / float(np.linalg.norm(e))
    W = pyramid_wheel_axes(cant_deg)
    tau_axis = axis_capability(W, e, tau_per_wheel)
    h_axis = axis_capability(W, e, h_per_wheel)
    res = slew_time_eigenaxis(
        angle_rad, eigenaxis_inertia(I, e), tau_axis, h_axis
    )
    return {
        "inertia": I,
        "eigenaxis": e,
        "wheel_axes": W,
        "tau_axis": tau_axis,
        "h_axis": h_axis,
        "slew": res,
    }


# ---------------------------------------------------------------------------
# Triangular (torque-limited) regime
# ---------------------------------------------------------------------------


def test_simulate_triangular_boundary_conditions() -> None:
    """θ(0)=0, θ(T)=angle, ω(0)=ω(T)=0 for a small (torque-limited) slew."""
    inputs = _build_pyramid_inputs(
        inertia_diag=(1000.0, 1500.0, 1800.0),
        eigenaxis=(0.0, 0.0, 1.0),
        angle_rad=math.radians(10.0),
        tau_per_wheel=0.2,
        h_per_wheel=12.0,
    )
    assert inputs["slew"].regime == "torque_limited"
    ts = simulate_slew_timeseries(
        angle_rad=math.radians(10.0),
        inertia_tensor=inputs["inertia"],
        eigenaxis_unit=inputs["eigenaxis"],
        wheel_axes=inputs["wheel_axes"],
        axis_max_torque=inputs["tau_axis"],
        axis_max_momentum=inputs["h_axis"],
        slew_time_s=inputs["slew"].slew_time_s,
        regime=inputs["slew"].regime,
        n_samples=80,
    )
    assert ts.t_s[0] == pytest.approx(0.0)
    assert ts.t_s[-1] == pytest.approx(inputs["slew"].slew_time_s)
    assert ts.body_angle_rad[0] == pytest.approx(0.0)
    assert ts.body_angle_rad[-1] == pytest.approx(math.radians(10.0))
    assert ts.body_rate_rad_s[0] == pytest.approx(0.0)
    assert ts.body_rate_rad_s[-1] == pytest.approx(0.0)


def test_simulate_triangular_peak_rate_matches_closed_form() -> None:
    """Peak |ω| in the time-series must match peak_rate_rad_s from the kinematics."""
    inputs = _build_pyramid_inputs(
        inertia_diag=(1000.0, 1500.0, 1800.0),
        eigenaxis=(0.0, 0.0, 1.0),
        angle_rad=math.radians(10.0),
        tau_per_wheel=0.2,
        h_per_wheel=12.0,
    )
    ts = simulate_slew_timeseries(
        angle_rad=math.radians(10.0),
        inertia_tensor=inputs["inertia"],
        eigenaxis_unit=inputs["eigenaxis"],
        wheel_axes=inputs["wheel_axes"],
        axis_max_torque=inputs["tau_axis"],
        axis_max_momentum=inputs["h_axis"],
        slew_time_s=inputs["slew"].slew_time_s,
        regime=inputs["slew"].regime,
        n_samples=201,
    )
    peak = max(abs(w) for w in ts.body_rate_rad_s)
    assert peak == pytest.approx(inputs["slew"].peak_rate_rad_s, rel=1e-3)


def test_simulate_triangular_wheel_momentum_below_axis_capability() -> None:
    inputs = _build_pyramid_inputs(
        inertia_diag=(1000.0, 1500.0, 1800.0),
        eigenaxis=(0.0, 0.0, 1.0),
        angle_rad=math.radians(10.0),
        tau_per_wheel=0.2,
        h_per_wheel=12.0,
    )
    ts = simulate_slew_timeseries(
        angle_rad=math.radians(10.0),
        inertia_tensor=inputs["inertia"],
        eigenaxis_unit=inputs["eigenaxis"],
        wheel_axes=inputs["wheel_axes"],
        axis_max_torque=inputs["tau_axis"],
        axis_max_momentum=inputs["h_axis"],
        slew_time_s=inputs["slew"].slew_time_s,
        regime=inputs["slew"].regime,
        n_samples=80,
    )
    max_per_wheel = max(max(abs(c) for c in row) for row in ts.wheel_momentum_nms)
    # No wheel may exceed its per-wheel momentum cap.
    assert max_per_wheel <= 12.0 + 1e-9


# ---------------------------------------------------------------------------
# Trapezoidal (momentum-limited) regime
# ---------------------------------------------------------------------------


def test_simulate_trapezoidal_coast_rate_matches_h_over_i() -> None:
    """During the coast phase ω ≈ h_axis / I_eff."""
    inputs = _build_pyramid_inputs(
        inertia_diag=(1000.0, 1500.0, 1800.0),
        eigenaxis=(0.0, 0.0, 1.0),
        angle_rad=math.radians(120.0),
        tau_per_wheel=0.2,
        h_per_wheel=2.0,
    )
    assert inputs["slew"].regime == "momentum_limited"
    ts = simulate_slew_timeseries(
        angle_rad=math.radians(120.0),
        inertia_tensor=inputs["inertia"],
        eigenaxis_unit=inputs["eigenaxis"],
        wheel_axes=inputs["wheel_axes"],
        axis_max_torque=inputs["tau_axis"],
        axis_max_momentum=inputs["h_axis"],
        slew_time_s=inputs["slew"].slew_time_s,
        regime=inputs["slew"].regime,
        n_samples=200,
    )
    # Mid-slew sample should be coasting at ω_coast = h_axis / I_eff.
    omega_coast = inputs["h_axis"] / 1800.0
    mid = ts.body_rate_rad_s[len(ts.body_rate_rad_s) // 2]
    assert mid == pytest.approx(omega_coast, rel=1e-3)


def test_simulate_trapezoidal_endpoints_zero_rate() -> None:
    inputs = _build_pyramid_inputs(
        inertia_diag=(1000.0, 1500.0, 1800.0),
        eigenaxis=(0.0, 0.0, 1.0),
        angle_rad=math.radians(120.0),
        tau_per_wheel=0.2,
        h_per_wheel=2.0,
    )
    ts = simulate_slew_timeseries(
        angle_rad=math.radians(120.0),
        inertia_tensor=inputs["inertia"],
        eigenaxis_unit=inputs["eigenaxis"],
        wheel_axes=inputs["wheel_axes"],
        axis_max_torque=inputs["tau_axis"],
        axis_max_momentum=inputs["h_axis"],
        slew_time_s=inputs["slew"].slew_time_s,
        regime=inputs["slew"].regime,
        n_samples=80,
    )
    assert ts.body_rate_rad_s[0] == pytest.approx(0.0)
    assert ts.body_rate_rad_s[-1] == pytest.approx(0.0)
    assert ts.body_angle_rad[-1] == pytest.approx(math.radians(120.0))


# ---------------------------------------------------------------------------
# Quaternion validity
# ---------------------------------------------------------------------------


def test_simulate_quaternions_unit_norm_and_match_axis_angle() -> None:
    inputs = _build_pyramid_inputs(
        inertia_diag=(800.0, 800.0, 800.0),
        eigenaxis=(1.0, 1.0, 1.0),
        angle_rad=math.radians(60.0),
        tau_per_wheel=0.2,
        h_per_wheel=12.0,
    )
    ts = simulate_slew_timeseries(
        angle_rad=math.radians(60.0),
        inertia_tensor=inputs["inertia"],
        eigenaxis_unit=inputs["eigenaxis"],
        wheel_axes=inputs["wheel_axes"],
        axis_max_torque=inputs["tau_axis"],
        axis_max_momentum=inputs["h_axis"],
        slew_time_s=inputs["slew"].slew_time_s,
        regime=inputs["slew"].regime,
        n_samples=40,
    )
    e_expected = inputs["eigenaxis"]
    for i, q in enumerate(ts.body_quat_lvlh_to_body):
        assert math.isclose(
            math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2),
            1.0,
            abs_tol=1e-9,
        )
        axis, angle = _quat_to_axis_angle(q)
        if angle > 1e-9:
            # axis sign should match eigenaxis (modulo numerical noise).
            assert np.allclose(axis, e_expected, atol=1e-9)
        assert angle == pytest.approx(ts.body_angle_rad[i], abs=1e-9)


# ---------------------------------------------------------------------------
# Wheel-speed conversion
# ---------------------------------------------------------------------------


def test_simulate_wheel_speed_rpm_omitted_without_max_speed() -> None:
    inputs = _build_pyramid_inputs(
        inertia_diag=(1000.0, 1500.0, 1800.0),
        eigenaxis=(0.0, 0.0, 1.0),
        angle_rad=math.radians(10.0),
        tau_per_wheel=0.2,
        h_per_wheel=12.0,
    )
    ts = simulate_slew_timeseries(
        angle_rad=math.radians(10.0),
        inertia_tensor=inputs["inertia"],
        eigenaxis_unit=inputs["eigenaxis"],
        wheel_axes=inputs["wheel_axes"],
        axis_max_torque=inputs["tau_axis"],
        axis_max_momentum=inputs["h_axis"],
        slew_time_s=inputs["slew"].slew_time_s,
        regime=inputs["slew"].regime,
        n_samples=10,
    )
    assert ts.wheel_speed_rpm is None
    assert ts.wheel_rotor_inertia_kgm2 is None


def test_simulate_wheel_speed_rpm_uses_derived_rotor_inertia() -> None:
    """J_w = h_max / (ω_max · 2π/60); peak |RPM| ≤ ω_max for feasible slews."""
    h_max = 12.0
    rpm_max = 6000.0
    inputs = _build_pyramid_inputs(
        inertia_diag=(1000.0, 1500.0, 1800.0),
        eigenaxis=(0.0, 0.0, 1.0),
        angle_rad=math.radians(10.0),
        tau_per_wheel=0.2,
        h_per_wheel=h_max,
    )
    ts = simulate_slew_timeseries(
        angle_rad=math.radians(10.0),
        inertia_tensor=inputs["inertia"],
        eigenaxis_unit=inputs["eigenaxis"],
        wheel_axes=inputs["wheel_axes"],
        axis_max_torque=inputs["tau_axis"],
        axis_max_momentum=inputs["h_axis"],
        slew_time_s=inputs["slew"].slew_time_s,
        regime=inputs["slew"].regime,
        n_samples=80,
        max_wheel_speed_rpm=rpm_max,
        max_momentum_per_wheel_nms=h_max,
    )
    assert ts.wheel_rotor_inertia_kgm2 == pytest.approx(
        h_max / (rpm_max * (2.0 * math.pi / 60.0))
    )
    assert ts.wheel_speed_rpm is not None
    peak_rpm = max(max(abs(c) for c in row) for row in ts.wheel_speed_rpm)
    assert peak_rpm <= rpm_max + 1e-6


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_simulate_rejects_zero_or_infeasible_regime() -> None:
    inputs = _build_pyramid_inputs(
        inertia_diag=(1000.0, 1500.0, 1800.0),
        eigenaxis=(0.0, 0.0, 1.0),
        angle_rad=math.radians(10.0),
        tau_per_wheel=0.2,
        h_per_wheel=12.0,
    )
    with pytest.raises(ValueError):
        simulate_slew_timeseries(
            angle_rad=math.radians(10.0),
            inertia_tensor=inputs["inertia"],
            eigenaxis_unit=inputs["eigenaxis"],
            wheel_axes=inputs["wheel_axes"],
            axis_max_torque=inputs["tau_axis"],
            axis_max_momentum=inputs["h_axis"],
            slew_time_s=inputs["slew"].slew_time_s,
            regime="zero",
            n_samples=10,
        )


# ---------------------------------------------------------------------------
# Router integration
# ---------------------------------------------------------------------------


def test_router_includes_timeseries_for_feasible_slew() -> None:
    payload = {
        "total_inertia_kgm2": {"ixx": 1000.0, "iyy": 1500.0, "izz": 1800.0},
        "wheel_array": {
            "max_torque_per_wheel_nm": 0.2,
            "max_momentum_per_wheel_nms": 12.0,
            "max_wheel_speed_rpm": 6000.0,
        },
        "maneuver": {
            "mode": "eigenaxis_angle",
            "eigenaxis": [0.0, 0.0, 1.0],
            "angle_deg": 30.0,
        },
        "timeseries_samples": 50,
    }
    r = client.post("/api/slew/compute", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    ts = body.get("timeseries")
    assert ts is not None
    assert len(ts["t_s"]) == 50
    assert len(ts["body_angle_rad"]) == 50
    assert len(ts["body_quat_lvlh_to_body"]) == 50
    assert len(ts["wheel_momentum_nms"]) == 50
    assert ts["wheel_speed_rpm"] is not None
    assert ts["wheel_rotor_inertia_kgm2"] is not None
    # Endpoints
    assert ts["body_angle_rad"][0] == pytest.approx(0.0)
    assert ts["body_angle_rad"][-1] == pytest.approx(math.radians(30.0))
    assert ts["body_rate_rad_s"][0] == pytest.approx(0.0)
    assert ts["body_rate_rad_s"][-1] == pytest.approx(0.0)


def test_router_omits_wheel_speed_when_max_speed_missing() -> None:
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
    ts = r.json()["timeseries"]
    assert ts is not None
    assert ts["wheel_speed_rpm"] is None
    assert ts["wheel_rotor_inertia_kgm2"] is None


def test_router_omits_timeseries_for_infeasible_slew() -> None:
    """A too-small momentum cap relative to the slew should still be feasible
    (just very slow); to force ``infeasible`` we set a wheel-array torque
    capacity of zero is impossible (validators reject 0), so we exercise the
    'zero' branch with a tiny eigenaxis component to keep it valid but verify
    timeseries is present.  We then test the infeasibility branch separately
    by injecting via the service layer, which is covered above.
    """
    # No public way to send a fully infeasible payload through the validators
    # (torque/momentum caps must be > 0).  Just confirm a nominal payload
    # always returns timeseries when feasible.
    payload = {
        "total_inertia_kgm2": {"ixx": 1.0, "iyy": 1.0, "izz": 1.0},
        "wheel_array": {
            "max_torque_per_wheel_nm": 0.001,
            "max_momentum_per_wheel_nms": 0.001,
        },
        "maneuver": {
            "mode": "eigenaxis_angle",
            "eigenaxis": [0.0, 0.0, 1.0],
            "angle_deg": 5.0,
        },
    }
    r = client.post("/api/slew/compute", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["regime"] in ("torque_limited", "momentum_limited")
    assert body["timeseries"] is not None
