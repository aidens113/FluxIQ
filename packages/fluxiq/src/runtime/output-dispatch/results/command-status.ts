import { type RuntimeFailureRecord } from "@fluxiq/contracts/runtime";
import type { FluxIQRuntimeCommandStatus } from "../../contracts.ts";
import { outputDispatchFailure } from "./record.ts";
export function failureForCommandStatus(status: FluxIQRuntimeCommandStatus | undefined): RuntimeFailureRecord | null {
  if (status === "timed_out")
    return outputDispatchFailure("timeout", "output_dispatch.timed_out", true);
  if (status === "rejected")
    return outputDispatchFailure("blocked_by_capability_or_policy", "output_dispatch.rejected", false, "dispatch");
  return null;
}
