import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../_shared/api.ts";
import { endpointResource } from "../../_shared/iam/index.ts";
import { isJsonObject } from "../../_shared/storage.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";
import {
  SECRET_KEYS_ENDPOINTS,
  type CreateSecretKeyRequest,
  type DeleteSecretKeyRequest,
  type RevealSecretKeyRequest,
  type RotateSecretKeyRequest,
  type SecretKeyAuthorizationPayload,
  type UpdateSecretKeyRequest
} from "./contracts.ts";
import type { SecretKeyActorSession, SecretKeysService } from "../runtime/service.ts";

// The acting user's id, never the payload, names whose password seals a value:
// it becomes the seal's `sealedByUserId` on create, rotate, and an upgrading reveal.
export function registerSecretKeysApi(registry: GlobalProgramApiRegistry, service: SecretKeysService, identityAccess?: IdentityAccessService): void {
  // A key's owner is the user that created it (`createdBy`, stamped from the
  // acting user on create), so the service already records it and no separate
  // `recordOwner` is needed. An unknown key, or one with no creator, has no owner.
  registry.registerResourceOwners("key", {
    ownerOf: async (id) => (await service.getKeySummary(id))?.createdBy ?? null
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.snapshot,
    permission: "programs.read",
    classification: "read",
    action: "secrets:Snapshot",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
    list: {
      items: (payload) => (payload as { keys?: readonly unknown[] } | undefined)?.keys ?? [],
      ref: (item) => ({ kind: "key", keyId: (item as { id?: unknown }).id }),
      replace: (payload, kept) => ({ ...(payload as object), keys: kept })
    },
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.createKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:CreateKey",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    creates: (payload) => {
      const id = payload !== null && typeof payload === "object" ? (payload as { id?: unknown }).id : undefined;
      return typeof id === "string" && id ? { kind: "key", keyId: id } : null;
    },
    handler: async (request) => {
      const payload = request.payload as CreateSecretKeyRequest | undefined;
      if (!payload?.name || !payload.value) return { ok: false, error: "name and value are required" };
      if (payload.metadata !== undefined && !isJsonObject(payload.metadata)) return { ok: false, error: "metadata must be a JSON object" };
      const authorization = await authorizeSecretMutation(identityAccess, payload, { requireTotp: false });
      if (!authorization.ok) return authorization;
      const actorSession = await verifiedActorSession(identityAccess, payload, request.actor);
      return { ok: true, payload: await service.createKey({ ...payload, createdBy: request.actor?.userId, actorSession }) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.updateKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:UpdateKey",
    accessLevel: "Write",
    resource: endpointResource.key("id"),
    handler: async (request) => {
      const payload = request.payload as UpdateSecretKeyRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      if (payload.metadata !== undefined && !isJsonObject(payload.metadata)) return { ok: false, error: "metadata must be a JSON object" };
      const authorization = await authorizeSecretMutation(identityAccess, payload);
      if (!authorization.ok) return authorization;
      const actorSession = await verifiedActorSession(identityAccess, payload, request.actor);
      return { ok: true, payload: await service.updateKey({ ...payload, actorSession }) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.rotateKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:RotateKey",
    accessLevel: "Write",
    resource: endpointResource.key("id"),
    handler: async (request) => {
      const payload = request.payload as RotateSecretKeyRequest | undefined;
      if (!payload?.id || !payload.value) return { ok: false, error: "id and value are required" };
      const authorization = await authorizeSecretMutation(identityAccess, payload);
      if (!authorization.ok) return authorization;
      const actorSession = await verifiedActorSession(identityAccess, payload, request.actor);
      return { ok: true, payload: await service.rotateKey({ ...payload, actorUserId: request.actor?.userId, actorSession }) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.revealKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:RevealKey",
    accessLevel: "Write",
    resource: endpointResource.key("id"),
    handler: async (request) => {
      const payload = request.payload as RevealSecretKeyRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      const authorization = await authorizeSecretMutation(identityAccess, payload);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: await service.revealKey({ ...payload, actorUserId: request.actor?.userId }) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.deleteKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:DeleteKey",
    accessLevel: "Write",
    resource: endpointResource.key("id"),
    handler: async (request) => {
      const payload = request.payload as DeleteSecretKeyRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      const authorization = await authorizeSecretMutation(identityAccess, payload);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: { deleted: await service.deleteKey(payload.id) } };
    }
  });
}

/**
 * The caller's own signed-in session, after `authorizeSecretMutation` verified
 * the password against it: the session that checked the password must be the
 * caller's, still live, and the caller's user. Its expiry bounds how long the
 * key stays held. Undefined otherwise, and then no session takes the key.
 */
async function verifiedActorSession(identityAccess: IdentityAccessService | undefined, payload: SecretKeyAuthorizationPayload, actor: ProgramApiActor | undefined): Promise<SecretKeyActorSession | undefined> {
  if (!identityAccess || !actor || !payload.authSessionId || payload.authSessionId !== actor.sessionId) return undefined;
  // An unknown or expired session reads as null; a store that cannot be read throws, and the request fails with it.
  const context = await identityAccess.validateSession(payload.authSessionId);
  if (!context || context.user.id !== actor.userId) return undefined;
  return { sessionId: context.session.id, userId: context.user.id, expiresAtMs: context.session.expiresAtMs };
}

async function authorizeSecretMutation(identityAccess: IdentityAccessService | undefined, payload: SecretKeyAuthorizationPayload, options: { requireTotp?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: string; requiresRecheck: true }> {
  if (!identityAccess) return { ok: false, requiresRecheck: true, error: "Secret key authorization is unavailable" };
  try {
    if (options.requireTotp === false) {
      await identityAccess.authorizeSessionPasswordPin({
        sessionId: payload.authSessionId,
        password: payload.authorizationPassword,
        pin: payload.authorizationPin
      });
    } else {
      await identityAccess.authorizeSessionCredentials({
        sessionId: payload.authSessionId,
        password: payload.authorizationPassword,
        pin: payload.authorizationPin,
        totp: payload.authorizationTotp
      });
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      requiresRecheck: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
