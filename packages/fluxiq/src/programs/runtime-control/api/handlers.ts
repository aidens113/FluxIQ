import type { RuntimeService } from "../../../runtime/index.ts";
import { getRuntimeRunInput, listRuntimeCapabilitiesInput, listRuntimeClientsInput, listRuntimeRunsInput, runtimeSnapshotInput } from "@fluxiq/contracts/program-api-inputs";
import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { endpointResource } from "../../_shared/iam/index.ts";
import { RUNTIME_ENDPOINTS, type GetRuntimeRunRequest } from "./contracts.ts";

export function registerRuntimeApi(registry: GlobalProgramApiRegistry, service: RuntimeService): void {
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.snapshot,
    permission: "programs.read",
    classification: "read",
    action: "ops:Snapshot",
    accessLevel: "Read",
    resource: endpointResource.program(),
    assistant: { input: runtimeSnapshotInput, summary: "Says how the engine is doing: its clients, capabilities and runs.", phrases: ["how is the engine doing", "engine status"] },
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.listClients,
    permission: "programs.read",
    classification: "read",
    action: "ops:ListClients",
    accessLevel: "List",
    resource: endpointResource.program(),
    assistant: { input: listRuntimeClientsInput, summary: "Lists the clients connected to the engine.", phrases: ["list connected clients", "which clients are connected"] },
    handler: () => ({ ok: true, payload: service.clients() })
  });
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.listCapabilities,
    permission: "programs.read",
    classification: "read",
    action: "ops:ListCapabilities",
    accessLevel: "List",
    resource: endpointResource.program(),
    assistant: { input: listRuntimeCapabilitiesInput, summary: "Lists what the engine can do.", phrases: ["what can the engine do"] },
    handler: async () => ({ ok: true, payload: await service.capabilities() })
  });
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.listRuns,
    permission: "programs.read",
    classification: "read",
    action: "ops:ListRuns",
    accessLevel: "List",
    resource: endpointResource.program(),
    assistant: { input: listRuntimeRunsInput, summary: "Lists the runs the engine knows of.", phrases: ["list engine runs"] },
    handler: async () => ({ ok: true, payload: (await service.snapshot()).runs })
  });
  registry.register({
    programId: "runtime",
    endpoint: RUNTIME_ENDPOINTS.getRun,
    permission: "programs.read",
    classification: "read",
    action: "ops:GetRun",
    accessLevel: "Read",
    resource: endpointResource.program(),
    assistant: { input: getRuntimeRunInput, summary: "Shows one engine run.", phrases: ["show this engine run"] },
    handler: (request) => {
      const payload = request.payload as GetRuntimeRunRequest | undefined;
      if (!payload?.runId) return { ok: false, error: "runId is required" };
      const run = service.getRun(payload.runId);
      return run ? { ok: true, payload: run } : { ok: false, error: `Runtime run not found: ${payload.runId}` };
    }
  });
}
