"""SI <-> English unit conversions for mass, length, and moment of inertia.

The backend operates in SI internally.  These helpers are exposed so the API,
tests, and any scripted clients share a single source of truth for the
conversion factors.
"""

from typing import Literal

UnitSystem = Literal["si", "english"]

# Exact SI equivalents for one English engineering unit.
SLUG_FT2_TO_KG_M2 = 1.3558179483314004
SLUG_TO_KG = 14.59390293720636
FT_TO_M = 0.3048


def inertia_to_si(value: float, system: UnitSystem) -> float:
    """Convert a scalar moment of inertia to kg·m²."""
    if system == "si":
        return float(value)
    return float(value) * SLUG_FT2_TO_KG_M2


def inertia_from_si(value_kg_m2: float, system: UnitSystem) -> float:
    """Convert a scalar moment of inertia from kg·m² to the requested system."""
    if system == "si":
        return float(value_kg_m2)
    return float(value_kg_m2) / SLUG_FT2_TO_KG_M2


def mass_to_si(value: float, system: UnitSystem) -> float:
    """Convert a scalar mass to kg."""
    if system == "si":
        return float(value)
    return float(value) * SLUG_TO_KG


def mass_from_si(value_kg: float, system: UnitSystem) -> float:
    """Convert a scalar mass from kg to the requested system."""
    if system == "si":
        return float(value_kg)
    return float(value_kg) / SLUG_TO_KG


def length_to_si(value: float, system: UnitSystem) -> float:
    """Convert a scalar length to m."""
    if system == "si":
        return float(value)
    return float(value) * FT_TO_M


def length_from_si(value_m: float, system: UnitSystem) -> float:
    """Convert a scalar length from m to the requested system."""
    if system == "si":
        return float(value_m)
    return float(value_m) / FT_TO_M
