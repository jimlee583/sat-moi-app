"""Unit tests for tensor construction, parallel-axis shift, and eigendecomposition."""

import numpy as np
import pytest

from app.services.inertia import (
    InertiaTensor,
    parallel_axis_shift,
    principal_axes,
)


def test_tensor_as_matrix_is_symmetric() -> None:
    t = InertiaTensor(ixx=1.0, iyy=2.0, izz=3.0, ixy=0.5, ixz=-0.2, iyz=0.1)
    m = t.as_matrix()
    assert m.shape == (3, 3)
    assert np.allclose(m, m.T)
    assert m[0, 0] == 1.0 and m[1, 1] == 2.0 and m[2, 2] == 3.0
    assert m[0, 1] == 0.5 and m[0, 2] == -0.2 and m[1, 2] == 0.1


def test_from_matrix_averages_off_diagonals() -> None:
    # Slightly asymmetric input should be symmetrized.
    m = np.array(
        [
            [5.0, 1.0, 2.0],
            [1.2, 6.0, 3.0],
            [2.0, 3.4, 7.0],
        ]
    )
    t = InertiaTensor.from_matrix(m)
    assert t.ixy == pytest.approx(1.1)
    assert t.ixz == pytest.approx(2.0)
    assert t.iyz == pytest.approx(3.2)


def test_parallel_axis_point_mass_along_x() -> None:
    """A point mass (zero local inertia) shifted by (d,0,0) adds m*d^2 to Iyy and Izz."""
    m = 4.0
    d = 2.5
    i_local = np.zeros((3, 3))
    i_shifted = parallel_axis_shift(i_local, m, np.array([d, 0.0, 0.0]))
    expected = m * d * d
    assert i_shifted[0, 0] == pytest.approx(0.0)
    assert i_shifted[1, 1] == pytest.approx(expected)
    assert i_shifted[2, 2] == pytest.approx(expected)
    # Products of inertia should remain zero for an axis-aligned offset.
    assert i_shifted[0, 1] == pytest.approx(0.0)
    assert i_shifted[0, 2] == pytest.approx(0.0)
    assert i_shifted[1, 2] == pytest.approx(0.0)


def test_parallel_axis_off_axis_offset_generates_products() -> None:
    m = 3.0
    r = np.array([1.0, 2.0, 0.0])
    i_shifted = parallel_axis_shift(np.zeros((3, 3)), m, r)
    # For r=(x,y,0): -m*x*y appears in Ixy, Iyx.
    assert i_shifted[0, 1] == pytest.approx(-m * r[0] * r[1])
    assert i_shifted[1, 0] == pytest.approx(-m * r[0] * r[1])
    assert i_shifted[0, 2] == pytest.approx(0.0)


def test_parallel_axis_zero_offset_is_identity() -> None:
    i_local = np.diag([1.0, 2.0, 3.0])
    i_shifted = parallel_axis_shift(i_local, 5.0, np.zeros(3))
    assert np.allclose(i_shifted, i_local)


def test_parallel_axis_negative_mass_rejected() -> None:
    with pytest.raises(ValueError):
        parallel_axis_shift(np.zeros((3, 3)), -1.0, np.array([1.0, 0.0, 0.0]))


def test_tensor_sum_is_linear() -> None:
    a = np.diag([1.0, 2.0, 3.0])
    b = np.diag([10.0, 20.0, 30.0])
    assert np.allclose(a + b, b + a)
    assert np.allclose((a + b) + a, a + (b + a))


def test_principal_axes_of_diagonal_tensor() -> None:
    m = np.diag([3.0, 5.0, 1.0])
    pa = principal_axes(m)
    assert pa.moments == pytest.approx((1.0, 3.0, 5.0))
    # Eigenvectors should be the standard basis up to sign.  We sign-normalize
    # so the largest-magnitude component is positive.
    for axis in pa.axes:
        v = np.array(axis)
        assert np.isclose(np.linalg.norm(v), 1.0)
        # Exactly one component should be ±1 for a diagonal input.
        assert np.isclose(np.max(np.abs(v)), 1.0)
        assert np.allclose(np.sort(np.abs(v)), [0.0, 0.0, 1.0])


def test_principal_axes_are_orthonormal() -> None:
    m = np.array(
        [
            [4.0, 1.0, 0.5],
            [1.0, 5.0, 0.2],
            [0.5, 0.2, 6.0],
        ]
    )
    pa = principal_axes(m)
    v = np.array(pa.axes)
    gram = v @ v.T
    assert np.allclose(gram, np.eye(3), atol=1e-12)
    # Moments should be ascending.
    assert pa.moments[0] <= pa.moments[1] <= pa.moments[2]
