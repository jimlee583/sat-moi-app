export type UnitSystem = "si" | "english";

export interface InertiaComponents {
  ixx: number;
  iyy: number;
  izz: number;
  ixy: number;
  ixz: number;
  iyz: number;
}

export interface DeployableRequest {
  name?: string;
  mass_kg: number;
  offset_m: [number, number, number];
  inertia: InertiaComponents;
  already_about_sv_ref: boolean;
}

export interface MoiComputeRequest {
  sv: InertiaComponents;
  sv_mass_kg?: number | null;
  deployables: DeployableRequest[];
}

export interface MoiComputeResponse {
  total_inertia_kgm2: InertiaComponents;
  total_mass_kg: number;
  principal_moments_kgm2: [number, number, number];
  principal_axes: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
}

/** Unit labels displayed in the UI for each quantity. */
export const UNIT_LABELS: Record<
  UnitSystem,
  { inertia: string; mass: string; length: string }
> = {
  si: { inertia: "kg·m\u00B2", mass: "kg", length: "m" },
  english: { inertia: "slug·ft\u00B2", mass: "slug", length: "ft" },
};

// Exact factors — one English unit in SI.
export const SLUG_FT2_TO_KG_M2 = 1.3558179483314004;
export const SLUG_TO_KG = 14.59390293720636;
export const FT_TO_M = 0.3048;

export function inertiaToSI(value: number, system: UnitSystem): number {
  return system === "si" ? value : value * SLUG_FT2_TO_KG_M2;
}

export function inertiaFromSI(value: number, system: UnitSystem): number {
  return system === "si" ? value : value / SLUG_FT2_TO_KG_M2;
}

export function massToSI(value: number, system: UnitSystem): number {
  return system === "si" ? value : value * SLUG_TO_KG;
}

export function massFromSI(value: number, system: UnitSystem): number {
  return system === "si" ? value : value / SLUG_TO_KG;
}

export function lengthToSI(value: number, system: UnitSystem): number {
  return system === "si" ? value : value * FT_TO_M;
}

export function lengthFromSI(value: number, system: UnitSystem): number {
  return system === "si" ? value : value / FT_TO_M;
}
