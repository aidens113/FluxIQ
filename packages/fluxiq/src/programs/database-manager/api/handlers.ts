import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { isJsonObject } from "../../_shared/storage.ts";
import {
  DATABASE_MANAGER_ENDPOINTS,
  type DatabaseManagerPutRecordRequest,
  type DatabaseManagerRecordRequest,
  type DatabaseManagerRunMigrationRequest,
  type DatabaseManagerStoreRequest
} from "./contracts.ts";
import type { DatabaseManagerService } from "../runtime/service.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";

export function registerDatabaseManagerApi(registry: GlobalProgramApiRegistry, service: DatabaseManagerService, identityAccess?: IdentityAccessService): void {
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.snapshot,
    permission: "programs.read",
    handler: async (request) => ({
      ok: true,
      payload: await service.snapshot(request.scope)
    })
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.listRecords,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerStoreRequest | undefined;
      if (!payload?.kind) return { ok: false, error: "kind is required" };
      const authorization = await authorizeSensitiveStore(identityAccess, payload);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: await service.listRecords(payload.kind, payload.scope ?? request.scope) };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.getRecord,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerRecordRequest | undefined;
      if (!payload?.kind || !payload.id) return { ok: false, error: "kind and id are required" };
      const authorization = await authorizeSensitiveStore(identityAccess, payload);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: await service.getRecord(payload.kind, payload.id, payload.scope ?? request.scope) };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.putRecord,
    permission: "data.manage",
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
    permission: "data.manage",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerRecordRequest | undefined;
      if (!payload?.kind || !payload.id) return { ok: false, error: "kind and id are required" };
      return { ok: true, payload: { deleted: await service.deleteRecord(payload.kind, payload.id, payload.scope ?? request.scope) } };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.runMigration,
    permission: "data.manage",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerRunMigrationRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      return { ok: true, payload: await service.runMigration(payload.id, payload.direction) };
    }
  });
}

async function authorizeSensitiveStore(identityAccess: IdentityAccessService | undefined, payload: DatabaseManagerStoreRequest): Promise<{ ok: true } | { ok: false; error: string; requiresRecheck?: boolean }> {
  if (!isSensitiveStore(payload.kind)) return { ok: true };
  if (!identityAccess) return { ok: false, error: "Sensitive store authorization is unavailable" };
  try {
    await identityAccess.authorizeSessionCredentials({
      sessionId: payload.authSessionId,
      password: payload.authorizationPassword,
      pin: payload.authorizationPin,
      totp: payload.authorizationTotp
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      requiresRecheck: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function isSensitiveStore(kind: string): boolean {
  const key = kind.trim().toLowerCase();
  return key === "identity.users" || key === "secret.keys";
}
