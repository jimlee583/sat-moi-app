import { apiFetch } from "./client";
import type { MoiComputeRequest, MoiComputeResponse } from "../types/moi";

/** POST /api/moi/compute — aggregate the SV tensor with all deployables. */
export async function computeMoi(
  req: MoiComputeRequest,
): Promise<MoiComputeResponse> {
  const res = await apiFetch("/api/moi/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return (await res.json()) as MoiComputeResponse;
}
