import type { GlobalProgramApiRegistry } from "../../_shared/api";
import { DATABASE_MANAGER_ENDPOINTS } from "./contracts";
import type { DatabaseManagerService } from "../runtime/service";

export function registerDatabaseManagerApi(registry: GlobalProgramApiRegistry, service: DatabaseManagerService): void {
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.snapshot,
    handler: async (request) => ({
      ok: true,
      payload: await service.snapshot(request.scope)
    })
  });
}
