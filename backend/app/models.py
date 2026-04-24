"""Pydantic request and response models for the MOI aggregation endpoint.

All inertia components are in kg·m², masses in kg, and offsets in m.  The
frontend converts from the user-selected unit system before sending.
"""

from typing import Optional

from pydantic import BaseModel, Field


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
