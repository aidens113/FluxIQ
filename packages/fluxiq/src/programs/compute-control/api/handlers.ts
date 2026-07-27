import type { GlobalProgramApiRegistry } from "../../_shared/api";
import { COMPUTE_CONTROL_ENDPOINTS, type ComputeControlCommandRequest } from "./contracts";
import type { ComputeControlService } from "../runtime/service";

export function registerComputeControlApi(registry: GlobalProgramApiRegistry, service: ComputeControlService): void {
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.snapshot,
    handler: () => ({ ok: true, payload: service.snapshot() })
  });
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.command,
    handler: (request) => {
      const payload = request.payload as ComputeControlCommandRequest | undefined;
      if (!payload?.targetComputeId || !payload.kind) {
        return { ok: false, error: "targetComputeId and kind are required" };
      }
      return { ok: true, payload: service.enqueueCommand(payload) };
    }
  });
}
