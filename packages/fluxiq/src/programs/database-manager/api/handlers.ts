import type { GlobalProgramApiRegistry } from "../../_shared/api";
import { isJsonObject } from "../../_shared/storage";
import {
  DATABASE_MANAGER_ENDPOINTS,
  type DatabaseManagerPutRecordRequest,
  type DatabaseManagerRecordRequest,
  type DatabaseManagerRunMigrationRequest,
  type DatabaseManagerStoreRequest
} from "./contracts";
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
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.listRecords,
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerStoreRequest | undefined;
      if (!payload?.kind) return { ok: false, error: "kind is required" };
      return { ok: true, payload: await service.listRecords(payload.kind, payload.scope ?? request.scope) };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.getRecord,
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerRecordRequest | undefined;
      if (!payload?.kind || !payload.id) return { ok: false, error: "kind and id are required" };
      return { ok: true, payload: await service.getRecord(payload.kind, payload.id, payload.scope ?? request.scope) };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.putRecord,
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerPutRecordRequest | undefined;
      if (!payload?.kind || !payload.id) return { ok: false, error: "kind and id are required" };
      if (!isJsonObject(payload.data)) return { ok: false, error: "data must be a JSON object" };
      return { ok: true, payload: await service.putRecord(payload.kind, payload.id, payload.data, payload.scope ?? request.scope) };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.deleteRecord,
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerRecordRequest | undefined;
      if (!payload?.kind || !payload.id) return { ok: false, error: "kind and id are required" };
      return { ok: true, payload: { deleted: await service.deleteRecord(payload.kind, payload.id, payload.scope ?? request.scope) } };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.runMigration,
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerRunMigrationRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      return { ok: true, payload: await service.runMigration(payload.id, payload.direction) };
    }
  });
}
