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
  /** Optional per-wheel max spin rate. When provided the response includes
   *  per-wheel RPM time-series and a derived rotor inertia. */
  max_wheel_speed_rpm?: number;
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
  /** Number of uniformly-spaced (in time) samples returned in the slew
   *  time-series. Default backend value is 80. */
  timeseries_samples?: number;
}

export interface SlewCurvePoint {
  angle_deg: number;
  slew_time_s: number;
  regime: SlewRegime;
}

/** Closed-form bang-bang slew sampled in time for the attitude/wheel-speed
 *  visualizer. Quaternions are scalar-first ``[w, x, y, z]`` and rotate a
 *  vector expressed in LVLH into the body frame, assuming body ≡ LVLH at
 *  ``t = 0`` (v1 limitation). */
export interface SlewTimeseries {
  t_s: number[];
  body_angle_rad: number[];
  body_rate_rad_s: number[];
  body_quat_lvlh_to_body: [number, number, number, number][];
  wheel_momentum_nms: [number, number, number, number][];
  wheel_speed_rpm: [number, number, number, number][] | null;
  wheel_rotor_inertia_kgm2: number | null;
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
  /** Time-domain slew samples (attitude quaternion, body rate, per-wheel
   *  momentum, optionally per-wheel RPM) for the 3D attitude visualizer.
   *  ``null`` for zero or infeasible maneuvers. */
  timeseries: SlewTimeseries | null;
}
