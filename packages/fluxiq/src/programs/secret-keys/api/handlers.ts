import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
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
import type { SecretKeysService } from "../runtime/service.ts";

export function registerSecretKeysApi(registry: GlobalProgramApiRegistry, service: SecretKeysService, identityAccess?: IdentityAccessService): void {
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.snapshot,
    permission: "programs.read",
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.createKey,
    permission: "secrets.manage",
    handler: async (request) => {
      const payload = request.payload as CreateSecretKeyRequest | undefined;
      if (!payload?.name || !payload.value) return { ok: false, error: "name and value are required" };
      if (payload.metadata !== undefined && !isJsonObject(payload.metadata)) return { ok: false, error: "metadata must be a JSON object" };
      const authorization = await authorizeSecretMutation(identityAccess, payload, { requireTotp: false });
      if (!authorization.ok) return authorization;
      return { ok: true, payload: await service.createKey({ ...payload, ...(request.actor?.userId ? { createdBy: request.actor.userId } : {}) }) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.updateKey,
    permission: "secrets.manage",
    handler: async (request) => {
      const payload = request.payload as UpdateSecretKeyRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      if (payload.metadata !== undefined && !isJsonObject(payload.metadata)) return { ok: false, error: "metadata must be a JSON object" };
      const authorization = await authorizeSecretMutation(identityAccess, payload);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: await service.updateKey(payload) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.rotateKey,
    permission: "secrets.manage",
    handler: async (request) => {
      const payload = request.payload as RotateSecretKeyRequest | undefined;
      if (!payload?.id || !payload.value) return { ok: false, error: "id and value are required" };
      const authorization = await authorizeSecretMutation(identityAccess, payload);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: await service.rotateKey(payload) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.revealKey,
    permission: "secrets.manage",
    handler: async (request) => {
      const payload = request.payload as RevealSecretKeyRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      const authorization = await authorizeSecretMutation(identityAccess, payload);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: await service.revealKey(payload) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.deleteKey,
    permission: "secrets.manage",
    handler: async (request) => {
      const payload = request.payload as DeleteSecretKeyRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      const authorization = await authorizeSecretMutation(identityAccess, payload);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: { deleted: await service.deleteKey(payload.id) } };
    }
  });
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
