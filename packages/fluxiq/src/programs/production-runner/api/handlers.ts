import type { GlobalProgramApiRegistry } from "../../_shared/api";
import {
  PRODUCTION_RUNNER_ENDPOINTS,
  type StartProductionRunRequest,
  type StopProductionRunRequest
} from "./contracts";
import type { ProductionRunnerService } from "../runtime/service";

export function registerProductionRunnerApi(registry: GlobalProgramApiRegistry, service: ProductionRunnerService): void {
  registry.register({
    programId: "production-runner",
    endpoint: PRODUCTION_RUNNER_ENDPOINTS.snapshot,
    handler: (request) => ({ ok: true, payload: service.snapshot(request.scope.domainId) })
  });
  registry.register({
    programId: "production-runner",
    endpoint: PRODUCTION_RUNNER_ENDPOINTS.start,
    handler: async (request) => {
      const payload = request.payload as StartProductionRunRequest | undefined;
      if (!payload?.name) return { ok: false, error: "name is required" };
      return { ok: true, payload: await service.startRun(payload) };
    }
  });
  registry.register({
    programId: "production-runner",
    endpoint: PRODUCTION_RUNNER_ENDPOINTS.stop,
    handler: async (request) => {
      const payload = request.payload as StopProductionRunRequest | undefined;
      if (!payload?.runId) return { ok: false, error: "runId is required" };
      return { ok: true, payload: await service.stopRun(payload.runId) };
    }
  });
}
