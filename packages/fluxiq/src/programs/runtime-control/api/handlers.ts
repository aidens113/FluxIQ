import type { RuntimeService } from "../../../runtime/index.ts";
import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { RUNTIME_ENDPOINTS, type GetRuntimeRunRequest } from "./contracts.ts";

export function registerRuntimeApi(registry: GlobalProgramApiRegistry, service: RuntimeService): void {
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.snapshot,
    permission: "programs.read",
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.listClients,
    permission: "programs.read",
    handler: () => ({ ok: true, payload: service.clients() })
  });
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.listCapabilities,
    permission: "programs.read",
    handler: async () => ({ ok: true, payload: await service.capabilities() })
  });
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.listRuns,
    permission: "programs.read",
    handler: async () => ({ ok: true, payload: (await service.snapshot()).runs })
  });
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.getRun,
    permission: "programs.read",
    handler: (request) => {
      const payload = request.payload as GetRuntimeRunRequest | undefined;
      if (!payload?.runId) return { ok: false, error: "runId is required" };
      const run = service.getRun(payload.runId);
      return run ? { ok: true, payload: run } : { ok: false, error: `Runtime run not found: ${payload.runId}` };
    }
  });
}
