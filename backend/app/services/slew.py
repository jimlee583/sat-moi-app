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
from typing import Literal

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
