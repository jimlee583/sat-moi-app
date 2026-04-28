import type { InertiaComponents } from "./moi";

/** Canonical "balanced" 4-wheel pyramid skew angle: arctan(sqrt(2)) [deg]. */
export const DEFAULT_CANT_DEG = (Math.atan(Math.sqrt(2)) * 180) / Math.PI;

export type SlewRegime =
  | "zero"
  | "torque_limited"
  | "momentum_limited"
  | "infeasible";

export type ManeuverMode = "eigenaxis_angle" | "quaternion_pair";

export interface WheelArrayInput {
  layout: "pyramid_4";
  cant_angle_deg: number;
  max_torque_per_wheel_nm: number;
  max_momentum_per_wheel_nms: number;
}

export interface ManeuverInput {
  mode: ManeuverMode;
  eigenaxis?: [number, number, number];
  angle_deg?: number;
  q_initial?: [number, number, number, number];
  q_final?: [number, number, number, number];
}

export interface SlewComputeRequest {
  total_inertia_kgm2: InertiaComponents;
  wheel_array: WheelArrayInput;
  maneuver: ManeuverInput;
  curve_points?: number;
  curve_max_angle_deg?: number;
}

export interface SlewCurvePoint {
  angle_deg: number;
  slew_time_s: number;
  regime: SlewRegime;
}

export interface SlewComputeResponse {
  eigenaxis_unit: [number, number, number];
  slew_angle_deg: number;
  slew_angle_rad: number;
  effective_inertia_kgm2: number;
  axis_max_torque_nm: number;
  axis_max_momentum_nms: number;
  crossover_angle_deg: number;
  regime: SlewRegime;
  peak_rate_rad_s: number;
  peak_rate_deg_s: number;
  slew_time_s: number;
  wheel_axes_body: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  curve: SlewCurvePoint[];
}
