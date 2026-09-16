import { randomUUID } from "node:crypto";
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
import type { RepositoryScope } from "../types.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";

type SensitiveStoreGrant = { userId: string; storeKey: string; expiresAtMs: number };
type SensitiveStoreAuthorization = { ok: true } | { ok: false; error: string; requiresRecheck?: boolean };

export function registerDatabaseManagerApi(registry: GlobalProgramApiRegistry, service: DatabaseManagerService, identityAccess?: IdentityAccessService): void {
  const sensitiveGrants = new Map<string, SensitiveStoreGrant>();
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.snapshot,
    permission: "programs.read",
    classification: "read",
    handler: async (request) => ({
      ok: true,
      payload: await service.snapshot(request.scope)
    })
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.authorizeStore,
    permission: "programs.read",
    classification: "program-gated",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerStoreRequest | undefined;
      if (!payload?.kind || !isSensitiveStore(payload.kind)) return { ok: false, error: "A sensitive store kind is required" };
      // A grant is issued only against a fresh credential recheck, never against an earlier grant, so no grant can renew itself past its expiry.
      const authorization = await recheckSessionCredentials(identityAccess, payload);
      if (!authorization.ok) return authorization;
      const now = Date.now();
      sweepExpiredGrants(sensitiveGrants, now);
      const grantId = randomUUID();
      const expiresAtMs = now + 5 * 60 * 1000;
      sensitiveGrants.set(grantId, { userId: request.actor?.userId ?? "", storeKey: sensitiveGrantStoreKey(payload.kind, payload.scope ?? request.scope), expiresAtMs });
      return { ok: true, payload: { grantId, expiresAtMs } };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.listRecords,
    permission: "programs.read",
    classification: "program-gated",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerStoreRequest | undefined;
      if (!payload?.kind) return { ok: false, error: "kind is required" };
      const scope = payload.scope ?? request.scope;
      const authorization = await authorizeSensitiveStore(identityAccess, payload, scope, sensitiveGrants, request.actor?.userId);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: await service.listRecordPage(payload.kind, scope, { ...(payload.limit !== undefined ? { limit: payload.limit } : {}), ...(payload.offset !== undefined ? { offset: payload.offset } : {}), ...(payload.search !== undefined ? { search: payload.search } : {}), orderBy: payload.sort === "id" ? "id" : payload.sort === "created" ? "created_at_ms" : "updated_at_ms", ...(payload.direction !== undefined ? { direction: payload.direction } : {}) }) };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.getRecord,
    permission: "programs.read",
    classification: "program-gated",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerRecordRequest | undefined;
      if (!payload?.kind || !payload.id) return { ok: false, error: "kind and id are required" };
      const scope = payload.scope ?? request.scope;
      const authorization = await authorizeSensitiveStore(identityAccess, payload, scope, sensitiveGrants, request.actor?.userId);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: await service.getRecord(payload.kind, payload.id, scope) };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.putRecord,
    permission: "data.manage",
    classification: "program-gated",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerPutRecordRequest | undefined;
      if (!payload?.kind || !payload.id) return { ok: false, error: "kind and id are required" };
      const scope = payload.scope ?? request.scope;
      const authorization = await authorizeSensitiveStore(identityAccess, payload, scope, sensitiveGrants, request.actor?.userId);
      if (!authorization.ok) return authorization;
      if (!isJsonObject(payload.data)) return { ok: false, error: "data must be a JSON object" };
      return { ok: true, payload: await service.putRecord(payload.kind, payload.id, payload.data, scope) };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.deleteRecord,
    permission: "data.manage",
    classification: "program-gated",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerRecordRequest | undefined;
      if (!payload?.kind || !payload.id) return { ok: false, error: "kind and id are required" };
      const scope = payload.scope ?? request.scope;
      const authorization = await authorizeSensitiveStore(identityAccess, payload, scope, sensitiveGrants, request.actor?.userId);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: { deleted: await service.deleteRecord(payload.kind, payload.id, scope) } };
    }
  });
  registry.register({
    programId: "database-manager",
    endpoint: DATABASE_MANAGER_ENDPOINTS.runMigration,
    permission: "data.manage",
    classification: "destructive-ungated",
    handler: async (request) => {
      const payload = request.payload as DatabaseManagerRunMigrationRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      return { ok: true, payload: await service.runMigration(payload.id, payload.direction) };
    }
  });
}

// Reads and writes on a sensitive store pass the same gate: a live grant issued to this actor
// for this store and the scope the operation acts on, or a fresh credential recheck.
async function authorizeSensitiveStore(identityAccess: IdentityAccessService | undefined, payload: DatabaseManagerStoreRequest, scope: RepositoryScope, grants: Map<string, SensitiveStoreGrant>, actorUserId?: string): Promise<SensitiveStoreAuthorization> {
  if (!isSensitiveStore(payload.kind)) return { ok: true };
  const now = Date.now();
  sweepExpiredGrants(grants, now);
  const grant = payload.grantId ? grants.get(payload.grantId) : undefined;
  if (grant && grant.expiresAtMs > now && grant.userId === (actorUserId ?? "") && grant.storeKey === sensitiveGrantStoreKey(payload.kind, scope)) return { ok: true };
  return recheckSessionCredentials(identityAccess, payload);
}

async function recheckSessionCredentials(identityAccess: IdentityAccessService | undefined, payload: DatabaseManagerStoreRequest): Promise<SensitiveStoreAuthorization> {
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

function sweepExpiredGrants(grants: Map<string, SensitiveStoreGrant>, now: number): void {
  for (const [id, grant] of grants) if (grant.expiresAtMs <= now) grants.delete(id);
}

function isSensitiveStore(kind: string): boolean {
  const key = kind.trim().toLowerCase();
  return key === "identity.users" || key === "secret.keys";
}

function sensitiveGrantStoreKey(kind: string, scope: RepositoryScope): string {
  return kind.trim().toLocaleLowerCase() + ":" + (scope.domainId ?? "global");
}
