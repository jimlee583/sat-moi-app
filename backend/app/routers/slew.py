"""Slew-time router — POST /api/slew/compute.

Given an aggregate inertia tensor, a 4-wheel pyramid RWA description, and a
maneuver (eigenaxis+angle or quaternion pair), return the rest-to-rest
eigenaxis slew time, the controlling regime (torque- vs momentum-limited),
and a sampled time-vs-angle curve for plotting.
"""

from __future__ import annotations

import math

import numpy as np
from fastapi import APIRouter

from app.models import (
    SlewComputeRequest,
    SlewComputeResponse,
    SlewCurvePoint,
    SlewTimeseries,
)
from app.services.inertia import InertiaTensor
from app.services.slew import (
    axis_capability,
    crossover_angle_rad,
    eigenaxis_from_quaternions,
    eigenaxis_inertia,
    pyramid_wheel_axes,
    simulate_slew_timeseries,
    slew_time_curve,
    slew_time_eigenaxis,
)

router = APIRouter(prefix="/api/slew", tags=["slew"])


@router.post("/compute", response_model=SlewComputeResponse)
def compute_slew(req: SlewComputeRequest) -> SlewComputeResponse:
    """Eigenaxis slew time for a 4-wheel pyramid RWA + total inertia."""
    i_total = InertiaTensor(
        ixx=req.total_inertia_kgm2.ixx,
        iyy=req.total_inertia_kgm2.iyy,
        izz=req.total_inertia_kgm2.izz,
        ixy=req.total_inertia_kgm2.ixy,
        ixz=req.total_inertia_kgm2.ixz,
        iyz=req.total_inertia_kgm2.iyz,
    ).as_matrix()

    if req.maneuver.mode == "eigenaxis_angle":
        assert req.maneuver.eigenaxis is not None and req.maneuver.angle_deg is not None
        e_raw = np.array(req.maneuver.eigenaxis, dtype=float)
        e_unit = e_raw / float(np.linalg.norm(e_raw))
        angle_rad = math.radians(req.maneuver.angle_deg)
    else:
        assert req.maneuver.q_initial is not None and req.maneuver.q_final is not None
        e_unit, angle_rad = eigenaxis_from_quaternions(
            np.array(req.maneuver.q_initial, dtype=float),
            np.array(req.maneuver.q_final, dtype=float),
        )

    wheel_axes = pyramid_wheel_axes(req.wheel_array.cant_angle_deg)

    i_eff = eigenaxis_inertia(i_total, e_unit)
    tau_axis = axis_capability(
        wheel_axes, e_unit, req.wheel_array.max_torque_per_wheel_nm
    )
    h_axis = axis_capability(
        wheel_axes, e_unit, req.wheel_array.max_momentum_per_wheel_nms
    )

    res = slew_time_eigenaxis(angle_rad, i_eff, tau_axis, h_axis)
    cross_rad = crossover_angle_rad(i_eff, tau_axis, h_axis)

    if req.curve_max_angle_deg is not None:
        max_angle_rad = math.radians(req.curve_max_angle_deg)
    else:
        # Default: at least 180°, or 1.5× the requested slew if it exceeds 120°.
        max_angle_rad = max(math.pi, 1.5 * angle_rad)

    samples = slew_time_curve(
        i_eff, tau_axis, h_axis, max_angle_rad, n_points=req.curve_points
    )
    angles = np.linspace(0.0, max_angle_rad, req.curve_points)
    curve = [
        SlewCurvePoint(
            angle_deg=math.degrees(float(a)),
            slew_time_s=s.slew_time_s,
            regime=s.regime,
        )
        for a, s in zip(angles, samples)
    ]

    wheel_axes_tuple = tuple(
        (float(wheel_axes[0, i]), float(wheel_axes[1, i]), float(wheel_axes[2, i]))
        for i in range(4)
    )

    timeseries: SlewTimeseries | None = None
    if res.regime in ("torque_limited", "momentum_limited"):
        ts = simulate_slew_timeseries(
            angle_rad=angle_rad,
            inertia_tensor=i_total,
            eigenaxis_unit=e_unit,
            wheel_axes=wheel_axes,
            axis_max_torque=tau_axis,
            axis_max_momentum=h_axis,
            slew_time_s=res.slew_time_s,
            regime=res.regime,
            n_samples=req.timeseries_samples,
            max_wheel_speed_rpm=req.wheel_array.max_wheel_speed_rpm,
            max_momentum_per_wheel_nms=req.wheel_array.max_momentum_per_wheel_nms,
        )
        timeseries = SlewTimeseries(
            t_s=ts.t_s,
            body_angle_rad=ts.body_angle_rad,
            body_rate_rad_s=ts.body_rate_rad_s,
            body_quat_lvlh_to_body=ts.body_quat_lvlh_to_body,
            wheel_momentum_nms=ts.wheel_momentum_nms,
            wheel_speed_rpm=ts.wheel_speed_rpm,
            wheel_rotor_inertia_kgm2=ts.wheel_rotor_inertia_kgm2,
        )

    return SlewComputeResponse(
        eigenaxis_unit=(float(e_unit[0]), float(e_unit[1]), float(e_unit[2])),
        slew_angle_deg=math.degrees(angle_rad),
        slew_angle_rad=angle_rad,
        effective_inertia_kgm2=i_eff,
        axis_max_torque_nm=tau_axis,
        axis_max_momentum_nms=h_axis,
        crossover_angle_deg=math.degrees(cross_rad) if math.isfinite(cross_rad) else float("inf"),
        regime=res.regime,
        peak_rate_rad_s=res.peak_rate_rad_s,
        peak_rate_deg_s=math.degrees(res.peak_rate_rad_s)
        if math.isfinite(res.peak_rate_rad_s)
        else float("inf"),
        slew_time_s=res.slew_time_s,
        wheel_axes_body=wheel_axes_tuple,
        curve=curve,
        timeseries=timeseries,
    )
