"""Moment-of-inertia math: tensor construction, parallel-axis shift, and eigendecomposition."""

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class InertiaTensor:
    """Symmetric 3x3 inertia tensor expressed as its six independent components.

    All values are in kg·m² and taken about a specific reference point.
    """

    ixx: float
    iyy: float
    izz: float
    ixy: float = 0.0
    ixz: float = 0.0
    iyz: float = 0.0

    def as_matrix(self) -> np.ndarray:
        """Return the full symmetric 3x3 matrix."""
        return np.array(
            [
                [self.ixx, self.ixy, self.ixz],
                [self.ixy, self.iyy, self.iyz],
                [self.ixz, self.iyz, self.izz],
            ],
            dtype=float,
        )

    @classmethod
    def from_matrix(cls, m: np.ndarray) -> "InertiaTensor":
        """Build from a symmetric 3x3 matrix, averaging off-diagonals for robustness."""
        if m.shape != (3, 3):
            raise ValueError(f"expected (3,3) matrix, got {m.shape}")
        ixy = 0.5 * (m[0, 1] + m[1, 0])
        ixz = 0.5 * (m[0, 2] + m[2, 0])
        iyz = 0.5 * (m[1, 2] + m[2, 1])
        return cls(
            ixx=float(m[0, 0]),
            iyy=float(m[1, 1]),
            izz=float(m[2, 2]),
            ixy=float(ixy),
            ixz=float(ixz),
            iyz=float(iyz),
        )


def parallel_axis_shift(
    i_local: np.ndarray,
    mass: float,
    offset: np.ndarray,
) -> np.ndarray:
    """Shift a rigid-body inertia tensor from a body's CG to a parallel reference point.

    For a body with inertia ``I_local`` about its own center of mass and a CG
    located at vector ``r`` from the desired reference point, the inertia
    tensor about that reference point is::

        I = I_local + m * ((r · r) I3 - r ⊗ r)

    Parameters
    ----------
    i_local:
        3x3 tensor about the body's own CG, in kg·m².
    mass:
        Body mass in kg. Must be non-negative.
    offset:
        3-vector from the reference point to the body's CG, in m.
    """
    if mass < 0:
        raise ValueError(f"mass must be non-negative, got {mass}")
    r = np.asarray(offset, dtype=float).reshape(3)
    r_dot_r = float(r @ r)
    return np.asarray(i_local, dtype=float) + mass * (
        r_dot_r * np.eye(3) - np.outer(r, r)
    )


@dataclass(frozen=True)
class PrincipalAxes:
    """Eigendecomposition of a symmetric inertia tensor."""

    moments: tuple[float, float, float]
    axes: tuple[tuple[float, float, float], ...]


def principal_axes(tensor: np.ndarray) -> PrincipalAxes:
    """Compute principal moments (ascending) and their unit eigenvectors.

    Each eigenvector is sign-normalized so its largest-magnitude component is
    positive, which keeps the output deterministic across platforms.
    """
    m = np.asarray(tensor, dtype=float)
    if m.shape != (3, 3):
        raise ValueError(f"expected (3,3) matrix, got {m.shape}")
    m_sym = 0.5 * (m + m.T)
    eigvals, eigvecs = np.linalg.eigh(m_sym)

    axes: list[tuple[float, float, float]] = []
    for i in range(3):
        v = eigvecs[:, i]
        idx = int(np.argmax(np.abs(v)))
        if v[idx] < 0:
            v = -v
        axes.append((float(v[0]), float(v[1]), float(v[2])))

    return PrincipalAxes(
        moments=(float(eigvals[0]), float(eigvals[1]), float(eigvals[2])),
        axes=tuple(axes),
    )
