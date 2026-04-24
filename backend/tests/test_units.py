"""Round-trip conversion tests for SI<->English unit helpers."""

import math

import pytest

from app.services.units import (
    FT_TO_M,
    SLUG_FT2_TO_KG_M2,
    SLUG_TO_KG,
    inertia_from_si,
    inertia_to_si,
    length_from_si,
    length_to_si,
    mass_from_si,
    mass_to_si,
)


@pytest.mark.parametrize("value", [0.0, 1.0, 42.5, 12345.6789])
def test_inertia_round_trip(value: float) -> None:
    si = inertia_to_si(value, "english")
    back = inertia_from_si(si, "english")
    assert math.isclose(back, value, rel_tol=1e-12, abs_tol=1e-12)


@pytest.mark.parametrize("value", [0.0, 1.0, 42.5, 12345.6789])
def test_mass_round_trip(value: float) -> None:
    si = mass_to_si(value, "english")
    back = mass_from_si(si, "english")
    assert math.isclose(back, value, rel_tol=1e-12, abs_tol=1e-12)


@pytest.mark.parametrize("value", [0.0, 1.0, 42.5, 12345.6789])
def test_length_round_trip(value: float) -> None:
    si = length_to_si(value, "english")
    back = length_from_si(si, "english")
    assert math.isclose(back, value, rel_tol=1e-12, abs_tol=1e-12)


def test_si_passthrough() -> None:
    for fn_to, fn_from in [
        (inertia_to_si, inertia_from_si),
        (mass_to_si, mass_from_si),
        (length_to_si, length_from_si),
    ]:
        assert fn_to(3.14, "si") == 3.14
        assert fn_from(3.14, "si") == 3.14


def test_english_factors_match_constants() -> None:
    assert math.isclose(inertia_to_si(1.0, "english"), SLUG_FT2_TO_KG_M2)
    assert math.isclose(mass_to_si(1.0, "english"), SLUG_TO_KG)
    assert math.isclose(length_to_si(1.0, "english"), FT_TO_M)
