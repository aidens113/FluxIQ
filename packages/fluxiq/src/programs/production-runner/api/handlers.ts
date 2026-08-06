import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import {
  PRODUCTION_RUNNER_ENDPOINTS,
  type AdvanceProductionRunRequest,
  type RegisterProductionTargetRequest,
  type StartProductionRunRequest,
  type StopProductionRunRequest
} from "./contracts.ts";
import type { ProductionRunnerService } from "../runtime/service.ts";

export function registerProductionRunnerApi(registry: GlobalProgramApiRegistry, service: ProductionRunnerService): void {
  registry.register({
    programId: "production-runner",
    endpoint: PRODUCTION_RUNNER_ENDPOINTS.snapshot,
    permission: "programs.read",
    handler: async (request) => ({ ok: true, payload: await service.snapshot(request.scope.domainId) })
  });
  registry.register({
    programId: "production-runner",
    endpoint: PRODUCTION_RUNNER_ENDPOINTS.registerTarget,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload as RegisterProductionTargetRequest | undefined;
      if (!payload?.id || !payload.name || !payload.type) return { ok: false, error: "id, name, and type are required" };
      return { ok: true, payload: await service.registerTarget(payload) };
    }
  });
  registry.register({
    programId: "production-runner",
    endpoint: PRODUCTION_RUNNER_ENDPOINTS.start,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload as StartProductionRunRequest | undefined;
      if (!payload?.name) return { ok: false, error: "name is required" };
      return { ok: true, payload: await service.startRun(payload) };
    }
  });
  registry.register({
    programId: "production-runner",
    endpoint: PRODUCTION_RUNNER_ENDPOINTS.advance,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload as AdvanceProductionRunRequest | undefined;
      if (payload?.runId) return { ok: true, payload: await service.advanceRun(payload.runId) };
      return { ok: true, payload: await service.advanceDueRuns(payload?.domainId ?? request.scope.domainId) };
    }
  });
  registry.register({
    programId: "production-runner",
    endpoint: PRODUCTION_RUNNER_ENDPOINTS.stop,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload as StopProductionRunRequest | undefined;
      if (!payload?.runId) return { ok: false, error: "runId is required" };
      return { ok: true, payload: await service.stopRun(payload.runId) };
    }
  });
  registry.register({
    programId: "production-runner",
    endpoint: PRODUCTION_RUNNER_ENDPOINTS.cancel,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload as StopProductionRunRequest | undefined;
      if (!payload?.runId) return { ok: false, error: "runId is required" };
      return { ok: true, payload: await service.cancelRun(payload.runId) };
    }
  });
}
