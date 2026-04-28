"""Pydantic request and response models for the MOI and slew endpoints.

All inertia components are in kg·m², masses in kg, offsets in m, torques in
N·m, momenta in N·m·s, angles in radians or degrees as suffixed.  The
frontend converts from the user-selected unit system before sending.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class InertiaInput(BaseModel):
    """Six independent components of a symmetric inertia tensor (kg·m²)."""

    ixx: float = Field(..., description="Moment of inertia about the x-axis [kg·m²]")
    iyy: float = Field(..., description="Moment of inertia about the y-axis [kg·m²]")
    izz: float = Field(..., description="Moment of inertia about the z-axis [kg·m²]")
    ixy: float = Field(default=0.0, description="Product of inertia -xy [kg·m²]")
    ixz: float = Field(default=0.0, description="Product of inertia -xz [kg·m²]")
    iyz: float = Field(default=0.0, description="Product of inertia -yz [kg·m²]")


class DeployableInput(BaseModel):
    """A deployable body to combine with the base SV."""

    name: Optional[str] = Field(default=None, description="Optional display label")
    mass_kg: float = Field(..., ge=0.0, description="Mass [kg]")
    offset_m: tuple[float, float, float] = Field(
        ...,
        description="Vector from the SV reference point to the deployable CG [m]",
    )
    inertia: InertiaInput = Field(
        ...,
        description=(
            "Inertia tensor about the deployable's own CG, unless "
            "already_about_sv_ref is true, in which case it is already "
            "taken about the SV reference point"
        ),
    )
    already_about_sv_ref: bool = Field(
        default=False,
        description="If true, skip the parallel-axis shift and sum the tensor directly",
    )


class MoiComputeRequest(BaseModel):
    """Full payload for POST /api/moi/compute."""

    sv: InertiaInput = Field(
        ..., description="Base SV inertia tensor about the SV reference point"
    )
    sv_mass_kg: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Optional base SV mass [kg] — informational, not used in MOI math",
    )
    deployables: list[DeployableInput] = Field(default_factory=list)


class InertiaOutput(BaseModel):
    """Full symmetric inertia tensor returned in kg·m²."""

    ixx: float
    iyy: float
    izz: float
    ixy: float
    ixz: float
    iyz: float


class MoiComputeResponse(BaseModel):
    """Result of a MOI aggregation."""

    total_inertia_kgm2: InertiaOutput
    total_mass_kg: float = Field(
        description="Sum of SV mass (if provided) and all deployable masses [kg]"
    )
    principal_moments_kgm2: tuple[float, float, float] = Field(
        description="Principal moments sorted ascending [kg·m²]"
    )
    principal_axes: tuple[
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
    ] = Field(
        description=(
            "Unit eigenvectors aligned with principal_moments_kgm2 "
            "(axes[i] corresponds to principal_moments_kgm2[i])"
        )
    )


# ---------------------------------------------------------------------------
# Slew-time models (POST /api/slew/compute)
# ---------------------------------------------------------------------------


class WheelArrayInput(BaseModel):
    """4-wheel pyramid reaction-wheel array with user-selectable cant angle.

    The four wheel spin axes are placed at azimuths 0°, 90°, 180°, 270° around
    the body +Z axis, each canted from +Z by ``cant_angle_deg``.
    """

    layout: Literal["pyramid_4"] = Field(
        default="pyramid_4",
        description="Array layout (only 'pyramid_4' is supported in v1)",
    )
    cant_angle_deg: float = Field(
        default=54.7356103172453,
        gt=0.0,
        lt=90.0,
        description=(
            "Cant angle from +Z body axis to each wheel spin axis [deg]; "
            "default ≈ arctan(√2) ≈ 54.7356° (balanced pyramid)"
        ),
    )
    max_torque_per_wheel_nm: float = Field(
        ...,
        gt=0.0,
        description="Per-wheel maximum reaction torque magnitude [N·m]",
    )
    max_momentum_per_wheel_nms: float = Field(
        ...,
        gt=0.0,
        description="Per-wheel maximum stored angular momentum magnitude [N·m·s]",
    )
    max_wheel_speed_rpm: Optional[float] = Field(
        default=None,
        gt=0.0,
        description=(
            "Optional per-wheel maximum spin rate [RPM]. When provided, the "
            "rotor inertia is derived as J_w = max_momentum / (max_speed · 2π/60) "
            "and the slew time-series response includes per-wheel speed in RPM."
        ),
    )


class ManeuverInput(BaseModel):
    """Slew maneuver definition.

    Two input modes are supported:

    * ``"eigenaxis_angle"``: caller supplies the body-frame slew axis (any
      non-zero vector — it is normalised internally) and the slew angle in
      degrees.  Angle must be in ``(0, 180]``.
    * ``"quaternion_pair"``: caller supplies ``q_initial`` and ``q_final``
      as scalar-first unit quaternions ``[w, x, y, z]`` encoding body-from-
      inertial attitude.  The shortest-path body-frame eigenaxis and angle
      are computed from ``q_initial^{-1} ⊗ q_final``.
    """

    mode: Literal["eigenaxis_angle", "quaternion_pair"] = Field(
        default="eigenaxis_angle"
    )
    eigenaxis: Optional[tuple[float, float, float]] = Field(
        default=None,
        description="Body-frame slew axis (eigenaxis_angle mode); auto-normalised",
    )
    angle_deg: Optional[float] = Field(
        default=None,
        description="Slew angle in degrees, in (0, 180] (eigenaxis_angle mode)",
    )
    q_initial: Optional[tuple[float, float, float, float]] = Field(
        default=None,
        description="Initial body-from-inertial quaternion [w, x, y, z]",
    )
    q_final: Optional[tuple[float, float, float, float]] = Field(
        default=None,
        description="Final body-from-inertial quaternion [w, x, y, z]",
    )

    @model_validator(mode="after")
    def _check_mode_payload(self) -> "ManeuverInput":
        if self.mode == "eigenaxis_angle":
            if self.eigenaxis is None or self.angle_deg is None:
                raise ValueError(
                    "eigenaxis_angle mode requires both 'eigenaxis' and 'angle_deg'"
                )
            if not (0.0 < self.angle_deg <= 180.0):
                raise ValueError(
                    f"angle_deg must lie in (0, 180], got {self.angle_deg}"
                )
            if all(c == 0.0 for c in self.eigenaxis):
                raise ValueError("eigenaxis must be a non-zero vector")
        else:
            if self.q_initial is None or self.q_final is None:
                raise ValueError(
                    "quaternion_pair mode requires both 'q_initial' and 'q_final'"
                )
        return self


class SlewComputeRequest(BaseModel):
    """Full payload for POST /api/slew/compute."""

    total_inertia_kgm2: InertiaInput = Field(
        ..., description="Aggregate SV inertia tensor about the SV reference point"
    )
    wheel_array: WheelArrayInput
    maneuver: ManeuverInput
    curve_points: int = Field(
        default=60,
        ge=2,
        le=500,
        description="Number of (angle, time) samples returned for plotting",
    )
    curve_max_angle_deg: Optional[float] = Field(
        default=None,
        gt=0.0,
        le=180.0,
        description=(
            "Maximum slew angle for the time-vs-angle curve [deg]; "
            "defaults to max(180°, 1.5 × the requested slew)"
        ),
    )
    timeseries_samples: int = Field(
        default=80,
        ge=10,
        le=400,
        description=(
            "Number of uniformly-spaced (in time) samples returned in the "
            "slew time-series for the attitude/wheel-speed visualizer"
        ),
    )


class SlewCurvePoint(BaseModel):
    """One sample of the slew-time-versus-angle curve."""

    angle_deg: float
    slew_time_s: float
    regime: Literal["zero", "torque_limited", "momentum_limited", "infeasible"]


class SlewTimeseries(BaseModel):
    """Closed-form bang-bang slew sampled in time, for the attitude visualizer.

    All samples are uniformly spaced in ``t_s`` over ``[0, slew_time_s]``.
    The body attitude is encoded as a scalar-first quaternion mapping the
    LVLH reference frame to the body frame, assuming the body starts aligned
    with LVLH at ``t=0`` (identity initial attitude — a v1 limitation).

    Per-wheel momentum is computed from rigid-body angular-momentum
    conservation with zero initial wheel momentum:
    ``H_wheels_body(t) = -I_total · ω_body(t)`` and per-wheel
    ``u(t) = W⁺ · H_wheels_body(t)``.

    ``wheel_speed_rpm`` and ``wheel_rotor_inertia_kgm2`` are populated only
    when ``max_wheel_speed_rpm`` was supplied on the request.
    """

    t_s: list[float]
    body_angle_rad: list[float]
    body_rate_rad_s: list[float]
    body_quat_lvlh_to_body: list[
        tuple[float, float, float, float]
    ] = Field(description="Scalar-first quaternion [w, x, y, z] per sample")
    wheel_momentum_nms: list[
        tuple[float, float, float, float]
    ] = Field(description="Per-wheel stored momentum [N·m·s] per sample (W1..W4)")
    wheel_speed_rpm: Optional[
        list[tuple[float, float, float, float]]
    ] = Field(
        default=None,
        description=(
            "Per-wheel signed spin rate [RPM] per sample (W1..W4); only "
            "populated when wheel_array.max_wheel_speed_rpm was given"
        ),
    )
    wheel_rotor_inertia_kgm2: Optional[float] = Field(
        default=None,
        description=(
            "Derived per-wheel rotor inertia J_w = h_max / ω_max [kg·m²]; "
            "only populated when wheel_array.max_wheel_speed_rpm was given"
        ),
    )


class SlewComputeResponse(BaseModel):
    """Result of a slew-time computation."""

    eigenaxis_unit: tuple[float, float, float] = Field(
        description="Body-frame unit eigenaxis used for the maneuver"
    )
    slew_angle_deg: float
    slew_angle_rad: float
    effective_inertia_kgm2: float = Field(
        description="ê^T I ê — effective scalar inertia about the eigenaxis"
    )
    axis_max_torque_nm: float = Field(
        description="Maximum body-axis torque the array can deliver along ê [N·m]"
    )
    axis_max_momentum_nms: float = Field(
        description="Maximum stored momentum the array supports along ê [N·m·s]"
    )
    crossover_angle_deg: float = Field(
        description=(
            "Slew angle at which the profile transitions from torque-limited "
            "(triangular) to momentum-limited (trapezoidal) [deg]"
        )
    )
    regime: Literal["zero", "torque_limited", "momentum_limited", "infeasible"]
    peak_rate_rad_s: float
    peak_rate_deg_s: float
    slew_time_s: float
    wheel_axes_body: tuple[
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
    ] = Field(description="Unit spin axis of each wheel in the SV body frame")
    curve: list[SlewCurvePoint] = Field(
        description="Sampled (angle, slew_time) pairs for plotting"
    )
    timeseries: Optional[SlewTimeseries] = Field(
        default=None,
        description=(
            "Time-domain slew samples (attitude quaternion, body rate, "
            "per-wheel momentum, optionally per-wheel RPM) for the 3D "
            "attitude/wheel-speed visualizer. Omitted when the maneuver "
            "is zero or infeasible."
        ),
    )
