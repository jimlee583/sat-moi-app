import { apiFetch } from "./client";
import type {
  SlewComputeRequest,
  SlewComputeResponse,
} from "../types/slew";

/** POST /api/slew/compute — eigenaxis slew time for a 4-wheel pyramid RWA. */
export async function computeSlew(
  req: SlewComputeRequest,
): Promise<SlewComputeResponse> {
  const res = await apiFetch("/api/slew/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return (await res.json()) as SlewComputeResponse;
}
