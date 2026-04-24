"""MOI aggregation router — POST /api/moi/compute."""

import numpy as np
from fastapi import APIRouter

from app.models import (
    InertiaOutput,
    MoiComputeRequest,
    MoiComputeResponse,
)
from app.services.inertia import (
    InertiaTensor,
    parallel_axis_shift,
    principal_axes,
)

router = APIRouter(prefix="/api/moi", tags=["moi"])


def _inertia_input_to_matrix(inp) -> np.ndarray:
    """Build a 3x3 numpy matrix from the six independent tensor components."""
    return InertiaTensor(
        ixx=inp.ixx,
        iyy=inp.iyy,
        izz=inp.izz,
        ixy=inp.ixy,
        ixz=inp.ixz,
        iyz=inp.iyz,
    ).as_matrix()


@router.post("/compute", response_model=MoiComputeResponse)
def compute_moi(req: MoiComputeRequest) -> MoiComputeResponse:
    """Aggregate the base SV tensor with all deployables and diagonalize the total."""
    i_total = _inertia_input_to_matrix(req.sv)
    total_mass = float(req.sv_mass_kg or 0.0)

    for d in req.deployables:
        i_local = _inertia_input_to_matrix(d.inertia)
        if d.already_about_sv_ref:
            i_contrib = i_local
        else:
            offset = np.array(d.offset_m, dtype=float)
            i_contrib = parallel_axis_shift(i_local, d.mass_kg, offset)
        i_total = i_total + i_contrib
        total_mass += float(d.mass_kg)

    tensor_out = InertiaTensor.from_matrix(i_total)
    pa = principal_axes(i_total)

    return MoiComputeResponse(
        total_inertia_kgm2=InertiaOutput(
            ixx=tensor_out.ixx,
            iyy=tensor_out.iyy,
            izz=tensor_out.izz,
            ixy=tensor_out.ixy,
            ixz=tensor_out.ixz,
            iyz=tensor_out.iyz,
        ),
        total_mass_kg=total_mass,
        principal_moments_kgm2=pa.moments,
        principal_axes=pa.axes,
    )
