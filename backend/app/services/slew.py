"""Rest-to-rest, eigenaxis slew-time kinematics for a 4-wheel pyramid RWA.

This module covers the v1 actuator model:

* Reaction wheels only.
* Single array layout: 4 wheels equally spaced around the +Z body axis, each
  spin axis canted by ``cant_angle_deg`` from +Z (the "pyramid" or "skew"
  array).  The cant angle is user-selectable; the conventional default of
  ``arctan(sqrt(2)) ≈ 54.7356°`` is exposed as ``DEFAULT_CANT_DEG``.
* Eigenaxis slew, rest-to-rest, with bang-bang torque.  The slew is decomposed
  into a torque-limited regime (triangular velocity profile) and a momentum-
  limited regime (trapezoidal profile), with the crossover reported.

All math here is in the SV body frame.  The total inertia tensor and the wheel
spin axes share that frame.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Optional

import numpy as np

# arctan(sqrt(2)) is the canonical "balanced" 4-wheel pyramid skew angle: it
# maximises the inscribed sphere of the achievable momentum/torque envelope
# for the standard pyramid layout.  Users can override this via the API.
DEFAULT_CANT_DEG: float = math.degrees(math.atan(math.sqrt(2.0)))  # 54.7356°


# ---------------------------------------------------------------------------
# Pyramid wheel geometry and per-axis allocation
# ---------------------------------------------------------------------------


def pyramid_wheel_axes(cant_angle_deg: float) -> np.ndarray:
    """Return the 3x4 matrix of unit wheel spin axes for the standard pyramid.

    Wheels are placed at azimuth angles ``phi = 0°, 90°, 180°, 270°`` around
    +Z and each is canted by ``beta = cant_angle_deg`` from +Z::

        w_i = [sin(beta) cos(phi_i), sin(beta) sin(phi_i), cos(beta)]

    Parameters
    ----------
    cant_angle_deg:
        Cant angle in degrees, in ``(0, 90)``.  ``0`` (all wheels along +Z)
        and ``90`` (all wheels in the XY plane) both lose a degree of
        freedom and are rejected.
    """
    if not math.isfinite(cant_angle_deg):
        raise ValueError(f"cant_angle_deg must be finite, got {cant_angle_deg}")
    if cant_angle_deg <= 0.0 or cant_angle_deg >= 90.0:
        raise ValueError(
            f"cant_angle_deg must lie in the open interval (0, 90), got {cant_angle_deg}"
        )
    beta = math.radians(cant_angle_deg)
    sb, cb = math.sin(beta), math.cos(beta)
    phis = [0.0, math.pi / 2.0, math.pi, 3.0 * math.pi / 2.0]
    cols = [np.array([sb * math.cos(p), sb * math.sin(p), cb]) for p in phis]
    return np.column_stack(cols)


def axis_capability(
    wheel_axes: np.ndarray,
    eigenaxis_unit: np.ndarray,
    per_wheel_max: float,
) -> float:
    """Maximum body-frame magnitude achievable along ``eigenaxis_unit``.

    Uses the minimum-norm pseudoinverse allocation ``u = W^+ (alpha * e)`` and
    scales ``alpha`` until the largest commanded wheel value reaches
    ``per_wheel_max``::

        alpha_max = per_wheel_max / max_i |[W^+ e]_i|

    The same formula applies to torque (``per_wheel_max = tau_max``) and
    stored momentum (``per_wheel_max = h_max``), since both come from the
    same linear allocation ``W u``.

    This is the standard pseudoinverse allocation used by most flight code.
    For a balanced pyramid it is optimal along the body principal axes and
    near-optimal for arbitrary directions; v1 deliberately stops here and
    flags the assumption rather than solving the exact LP.
    """
    if per_wheel_max < 0.0:
        raise ValueError(f"per_wheel_max must be non-negative, got {per_wheel_max}")
    e = np.asarray(eigenaxis_unit, dtype=float).reshape(3)
    norm = float(np.linalg.norm(e))
    if norm == 0.0:
        raise ValueError("eigenaxis_unit must be a non-zero vector")
    e_hat = e / norm

    w_pinv = np.linalg.pinv(np.asarray(wheel_axes, dtype=float))  # (4, 3)
    u_unit = w_pinv @ e_hat  # commanded wheel value per unit of axis output
    denom = float(np.max(np.abs(u_unit)))
    if denom == 0.0:
        # Geometrically unreachable direction (shouldn't happen for a full-rank
        # 3x4 W, but guard anyway).
        return 0.0
    return per_wheel_max / denom


# ---------------------------------------------------------------------------
# Maneuver: eigenaxis + angle, optionally derived from a quaternion pair
# ---------------------------------------------------------------------------


def quat_normalize(q: np.ndarray) -> np.ndarray:
    """Normalise a scalar-first quaternion ``[w, x, y, z]``."""
    q = np.asarray(q, dtype=float).reshape(4)
    n = float(np.linalg.norm(q))
    if n == 0.0:
        raise ValueError("quaternion magnitude must be non-zero")
    return q / n


def quat_multiply(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Hamilton product ``a ⊗ b`` of two scalar-first quaternions."""
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return np.array(
        [
            aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
        ]
    )


def quat_conjugate(q: np.ndarray) -> np.ndarray:
    """Conjugate of a unit quaternion (= inverse)."""
    return np.array([q[0], -q[1], -q[2], -q[3]])


def eigenaxis_from_quaternions(
    q_initial: np.ndarray,
    q_final: np.ndarray,
) -> tuple[np.ndarray, float]:
    """Shortest-path eigenaxis (unit) and angle (rad) between two attitudes.

    Both quaternions are scalar-first ``[w, x, y, z]`` and assumed to encode
    body-from-inertial attitude.  The body-frame error quaternion is
    ``q_e = q_initial^{-1} ⊗ q_final``; the rotation it encodes is the slew
    that takes the body from its initial to its final orientation.  The sign
    of ``q_e`` is flipped if necessary so the returned angle lies in
    ``[0, π]`` (shortest path).
    """
    qi = quat_normalize(q_initial)
    qf = quat_normalize(q_final)
    qe = quat_multiply(quat_conjugate(qi), qf)
    if qe[0] < 0.0:
        qe = -qe
    w = float(np.clip(qe[0], -1.0, 1.0))
    angle = 2.0 * math.acos(w)
    sin_half = math.sin(angle / 2.0)
    if sin_half < 1e-12:
        # No rotation — pick an arbitrary unit axis to keep the output well-defined.
        return np.array([0.0, 0.0, 1.0]), 0.0
    axis = qe[1:4] / sin_half
    axis = axis / float(np.linalg.norm(axis))
    return axis, angle


def eigenaxis_inertia(inertia_tensor: np.ndarray, eigenaxis_unit: np.ndarray) -> float:
    """Effective scalar inertia about a body-frame unit axis: ``ê^T I ê``."""
    e = np.asarray(eigenaxis_unit, dtype=float).reshape(3)
    n = float(np.linalg.norm(e))
    if n == 0.0:
        raise ValueError("eigenaxis_unit must be a non-zero vector")
    e_hat = e / n
    i_mat = np.asarray(inertia_tensor, dtype=float)
    i_sym = 0.5 * (i_mat + i_mat.T)
    return float(e_hat @ i_sym @ e_hat)


# ---------------------------------------------------------------------------
# Slew kinematics (rest-to-rest, eigenaxis, bang-bang)
# ---------------------------------------------------------------------------


SlewRegime = Literal["zero", "torque_limited", "momentum_limited", "infeasible"]


@dataclass(frozen=True)
class SlewResult:
    """Outcome of a single rest-to-rest eigenaxis slew computation."""

    regime: SlewRegime
    slew_time_s: float
    peak_rate_rad_s: float


def slew_time_eigenaxis(
    angle_rad: float,
    effective_inertia: float,
    axis_max_torque: float,
    axis_max_momentum: float,
) -> SlewResult:
    """Rest-to-rest, bang-bang eigenaxis slew time.

    With effective inertia ``I``, available torque ``τ`` and stored momentum
    ``h`` projected onto the eigenaxis:

    * Triangular (torque-limited) profile peak rate: ``ω_peak = sqrt(θ τ / I)``.
    * If the resulting peak momentum ``I ω_peak`` does not exceed ``h``, the
      profile is purely accelerate / decelerate and ``t = 2 sqrt(θ I / τ)``.
    * Otherwise the wheels saturate at ``ω_max = h / I`` and the profile is
      trapezoidal: ``t = θ I / h + h / τ``.

    If ``angle_rad`` is zero the result is trivially zero.  If either the
    torque or momentum capability is non-positive the maneuver is reported
    as ``"infeasible"`` with ``inf`` slew time.
    """
    if angle_rad < 0.0:
        raise ValueError(f"angle_rad must be non-negative, got {angle_rad}")
    if effective_inertia <= 0.0:
        raise ValueError(
            f"effective_inertia must be positive, got {effective_inertia}"
        )
    if angle_rad == 0.0:
        return SlewResult(regime="zero", slew_time_s=0.0, peak_rate_rad_s=0.0)
    if axis_max_torque <= 0.0 or axis_max_momentum <= 0.0:
        return SlewResult(
            regime="infeasible",
            slew_time_s=math.inf,
            peak_rate_rad_s=math.inf,
        )

    omega_tri = math.sqrt(angle_rad * axis_max_torque / effective_inertia)
    h_tri = effective_inertia * omega_tri

    if h_tri <= axis_max_momentum:
        t = 2.0 * math.sqrt(angle_rad * effective_inertia / axis_max_torque)
        return SlewResult(
            regime="torque_limited",
            slew_time_s=t,
            peak_rate_rad_s=omega_tri,
        )

    omega_coast = axis_max_momentum / effective_inertia
    t = (
        angle_rad * effective_inertia / axis_max_momentum
        + axis_max_momentum / axis_max_torque
    )
    return SlewResult(
        regime="momentum_limited",
        slew_time_s=t,
        peak_rate_rad_s=omega_coast,
    )


def crossover_angle_rad(
    effective_inertia: float,
    axis_max_torque: float,
    axis_max_momentum: float,
) -> float:
    """Eigenaxis slew angle at which torque-limited transitions to momentum-limited.

    The triangular profile saturates wheel momentum exactly when
    ``θ τ I = h²``, i.e. ``θ_x = h² / (τ I)``.  For angles ``< θ_x`` the
    slew is torque-limited; above it the slew is momentum-limited.
    """
    if axis_max_torque <= 0.0 or effective_inertia <= 0.0:
        return math.inf
    return (axis_max_momentum * axis_max_momentum) / (
        axis_max_torque * effective_inertia
    )


def slew_time_curve(
    effective_inertia: float,
    axis_max_torque: float,
    axis_max_momentum: float,
    max_angle_rad: float,
    n_points: int = 60,
) -> list[SlewResult]:
    """Sample ``slew_time_eigenaxis`` over ``[0, max_angle_rad]``.

    Used by the frontend to draw the time-vs-angle curve and visualise the
    triangular/trapezoidal regime kink.
    """
    if n_points < 2:
        raise ValueError(f"n_points must be >= 2, got {n_points}")
    if max_angle_rad <= 0.0:
        raise ValueError(f"max_angle_rad must be positive, got {max_angle_rad}")
    angles = np.linspace(0.0, max_angle_rad, n_points)
    return [
        slew_time_eigenaxis(
            float(a), effective_inertia, axis_max_torque, axis_max_momentum
        )
        for a in angles
    ]


# ---------------------------------------------------------------------------
# Time-domain sampling for the attitude / wheel-speed visualizer
# ---------------------------------------------------------------------------


_RPM_PER_RAD_PER_S: float = 60.0 / (2.0 * math.pi)
_RAD_PER_S_PER_RPM: float = (2.0 * math.pi) / 60.0


@dataclass(frozen=True)
class SlewTimeseriesResult:
    """Closed-form bang-bang slew sampled in time, in SI units.

    All arrays are aligned by index over ``t_s``.  ``wheel_speed_rpm`` and
    ``wheel_rotor_inertia_kgm2`` are populated only when a per-wheel max
    spin rate was supplied (otherwise the rotor inertia is unknown and we
    cannot convert wheel momentum to wheel speed).

    The body attitude quaternion ``body_quat_lvlh_to_body[i]`` is
    scalar-first ``[w, x, y, z]`` and rotates a vector expressed in LVLH
    into the body frame.  This module assumes the body is aligned with
    LVLH at ``t = 0`` (identity initial attitude); shifting that
    assumption is left to the caller / future work.
    """

    t_s: list[float]
    body_angle_rad: list[float]
    body_rate_rad_s: list[float]
    body_quat_lvlh_to_body: list[tuple[float, float, float, float]]
    wheel_momentum_nms: list[tuple[float, float, float, float]]
    wheel_speed_rpm: Optional[list[tuple[float, float, float, float]]]
    wheel_rotor_inertia_kgm2: Optional[float]


def _axis_angle_to_quat(axis_unit: np.ndarray, angle_rad: float) -> np.ndarray:
    """Scalar-first quaternion ``[w, x, y, z]`` for an axis-angle rotation."""
    half = 0.5 * angle_rad
    s = math.sin(half)
    return np.array(
        [math.cos(half), axis_unit[0] * s, axis_unit[1] * s, axis_unit[2] * s]
    )


def _profile_theta_omega(
    t: float,
    slew_time_s: float,
    angle_rad: float,
    effective_inertia: float,
    axis_max_torque: float,
    axis_max_momentum: float,
    regime: SlewRegime,
) -> tuple[float, float]:
    """Closed-form ``(θ(t), ω(t))`` along the eigenaxis for a bang-bang slew.

    ``regime`` selects between the symmetric triangular profile (always
    accelerate then decelerate at ``±τ/I``) and the trapezoidal profile
    (accelerate, coast at ``ω = h/I``, decelerate).
    """
    if t <= 0.0:
        return 0.0, 0.0
    if t >= slew_time_s:
        return angle_rad, 0.0

    if regime == "torque_limited":
        a = axis_max_torque / effective_inertia
        t_half = 0.5 * slew_time_s
        if t <= t_half:
            omega = a * t
            theta = 0.5 * a * t * t
        else:
            tau = t - t_half
            omega_peak = a * t_half
            theta_half = 0.5 * a * t_half * t_half
            omega = omega_peak - a * tau
            theta = theta_half + omega_peak * tau - 0.5 * a * tau * tau
        return theta, omega

    if regime == "momentum_limited":
        a = axis_max_torque / effective_inertia
        omega_coast = axis_max_momentum / effective_inertia
        t1 = omega_coast / a  # time to spin up to coast
        # Decel mirrors accel; coast occupies [t1, slew_time_s - t1].
        t2 = slew_time_s - t1
        if t <= t1:
            omega = a * t
            theta = 0.5 * a * t * t
        elif t <= t2:
            theta_t1 = 0.5 * a * t1 * t1
            omega = omega_coast
            theta = theta_t1 + omega_coast * (t - t1)
        else:
            theta_t1 = 0.5 * a * t1 * t1
            theta_t2 = theta_t1 + omega_coast * (t2 - t1)
            tau = t - t2
            omega = omega_coast - a * tau
            theta = theta_t2 + omega_coast * tau - 0.5 * a * tau * tau
        return theta, omega

    # zero / infeasible — handled by the caller (we never sample those).
    return 0.0, 0.0


def simulate_slew_timeseries(
    angle_rad: float,
    inertia_tensor: np.ndarray,
    eigenaxis_unit: np.ndarray,
    wheel_axes: np.ndarray,
    axis_max_torque: float,
    axis_max_momentum: float,
    slew_time_s: float,
    regime: SlewRegime,
    n_samples: int = 80,
    max_wheel_speed_rpm: Optional[float] = None,
    max_momentum_per_wheel_nms: Optional[float] = None,
) -> SlewTimeseriesResult:
    """Sample a rest-to-rest eigenaxis bang-bang slew uniformly in time.

    Parameters
    ----------
    angle_rad:
        Total slew angle (already shortest-path), strictly positive.
    inertia_tensor:
        Aggregate body-frame inertia tensor (3x3, kg·m²).
    eigenaxis_unit:
        Body-frame unit eigenaxis ``ê``.
    wheel_axes:
        ``3x4`` matrix of body-frame unit wheel spin axes (columns are wheels).
    axis_max_torque, axis_max_momentum:
        Per-axis capability of the wheel array along ``ê``, as returned by
        :func:`axis_capability`.
    slew_time_s:
        Total maneuver duration as returned by :func:`slew_time_eigenaxis`.
    regime:
        Profile regime; this function only handles ``"torque_limited"`` and
        ``"momentum_limited"`` (callers must skip ``"zero"`` and
        ``"infeasible"``).
    n_samples:
        Number of uniformly-spaced time samples in ``[0, slew_time_s]``.
    max_wheel_speed_rpm:
        Optional per-wheel maximum spin rate.  When supplied together with
        ``max_momentum_per_wheel_nms``, the rotor inertia is derived as
        ``J_w = h_max / (ω_max · 2π/60)`` and per-wheel speeds in RPM are
        included in the result.
    max_momentum_per_wheel_nms:
        The per-wheel momentum limit used to derive ``J_w``.  Required when
        ``max_wheel_speed_rpm`` is supplied.

    Returns
    -------
    SlewTimeseriesResult
        Time-aligned arrays of body angle, body rate, attitude quaternion,
        per-wheel stored momentum, and (optionally) per-wheel speed.

    Notes
    -----
    Wheel momentum is derived from rigid-body angular-momentum conservation
    with zero initial wheel momentum:
    ``H_wheels_body = -I · ω_body``.  Per-wheel allocation uses the
    Moore–Penrose pseudoinverse of ``W`` (the same allocation used by
    :func:`axis_capability`).  These are the *minimum-norm* commanded
    wheel momenta consistent with the desired body momentum — actual flight
    code may distribute differently, but for a balanced pyramid the answer
    is essentially identical.
    """
    if regime not in ("torque_limited", "momentum_limited"):
        raise ValueError(
            f"simulate_slew_timeseries only handles torque/momentum-limited "
            f"regimes, got {regime!r}"
        )
    if n_samples < 2:
        raise ValueError(f"n_samples must be >= 2, got {n_samples}")
    if angle_rad <= 0.0:
        raise ValueError(f"angle_rad must be positive, got {angle_rad}")
    if slew_time_s <= 0.0:
        raise ValueError(f"slew_time_s must be positive, got {slew_time_s}")
    if effective_inertia := float(eigenaxis_inertia(inertia_tensor, eigenaxis_unit)):
        pass
    else:
        raise ValueError("effective inertia along eigenaxis is zero")

    e = np.asarray(eigenaxis_unit, dtype=float).reshape(3)
    e = e / float(np.linalg.norm(e))
    inertia = np.asarray(inertia_tensor, dtype=float)
    inertia_sym = 0.5 * (inertia + inertia.T)
    # I·ê — used at every sample for H_body = ω·(I·ê).
    i_dot_e = inertia_sym @ e

    w = np.asarray(wheel_axes, dtype=float)
    w_pinv = np.linalg.pinv(w)  # (4, 3)

    # Derive rotor inertia once if we have the data.
    j_wheel: Optional[float] = None
    if max_wheel_speed_rpm is not None and max_momentum_per_wheel_nms is not None:
        omega_max_rad_s = max_wheel_speed_rpm * _RAD_PER_S_PER_RPM
        if omega_max_rad_s > 0.0:
            j_wheel = max_momentum_per_wheel_nms / omega_max_rad_s

    times = np.linspace(0.0, slew_time_s, n_samples)

    t_s_out: list[float] = []
    theta_out: list[float] = []
    omega_out: list[float] = []
    quat_out: list[tuple[float, float, float, float]] = []
    h_wheel_out: list[tuple[float, float, float, float]] = []
    rpm_out: Optional[list[tuple[float, float, float, float]]] = (
        [] if j_wheel is not None else None
    )

    for t_val in times:
        t_f = float(t_val)
        theta, omega = _profile_theta_omega(
            t_f,
            slew_time_s,
            angle_rad,
            effective_inertia,
            axis_max_torque,
            axis_max_momentum,
            regime,
        )
        q = _axis_angle_to_quat(e, theta)
        # Body angular momentum H_body = ω · I·ê.  Wheels store -H_body.
        h_wheels_body = -omega * i_dot_e
        u = w_pinv @ h_wheels_body  # (4,) per-wheel momentum [N·m·s]
        t_s_out.append(t_f)
        theta_out.append(theta)
        omega_out.append(omega)
        quat_out.append((float(q[0]), float(q[1]), float(q[2]), float(q[3])))
        h_wheel_out.append(
            (float(u[0]), float(u[1]), float(u[2]), float(u[3]))
        )
        if rpm_out is not None and j_wheel is not None:
            rpm_vec = (u / j_wheel) * _RPM_PER_RAD_PER_S
            rpm_out.append(
                (
                    float(rpm_vec[0]),
                    float(rpm_vec[1]),
                    float(rpm_vec[2]),
                    float(rpm_vec[3]),
                )
            )

    return SlewTimeseriesResult(
        t_s=t_s_out,
        body_angle_rad=theta_out,
        body_rate_rad_s=omega_out,
        body_quat_lvlh_to_body=quat_out,
        wheel_momentum_nms=h_wheel_out,
        wheel_speed_rpm=rpm_out,
        wheel_rotor_inertia_kgm2=j_wheel,
    )
