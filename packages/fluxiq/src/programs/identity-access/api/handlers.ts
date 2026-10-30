import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { endpointResource } from "../../_shared/iam/index.ts";
import {
  IDENTITY_ACCESS_ENDPOINTS,
  type CreateIdentityUserRequest,
  type RevokeSessionRequest,
  type SessionRequest,
  type SetIdentitySecretRequest,
  type TotpConfirmRequest,
  type UpdateIdentityUserRequest,
  type VaultUnlockRequest
} from "./contracts.ts";
import type { IdentityAccessService } from "../runtime/service.ts";

/**
 * The refusal an endpoint returns when the calling session has not just
 * re-proved its credentials. `requiresRecheck` tells a client to collect the
 * password, PIN, and authenticator code again rather than to treat the call as
 * a permission failure.
 */
type CredentialRecheckRefusal = { ok: false; requiresRecheck: true; error: string };

/** Authorization carried alongside a request, proving the caller's own credentials. */
type CredentialRecheck = {
  authSessionId?: string | undefined;
  authorizationPassword?: string | undefined;
  authorizationPin?: string | undefined;
  authorizationTotp?: string | undefined;
};

/**
 * Re-proves the calling session's credentials before an endpoint hands out or
 * uses authority. Returns the refusal to send back, or `null` when the recheck
 * passed. Endpoints that only take authority away do not call this.
 */
async function recheckCredentials(service: IdentityAccessService, payload: CredentialRecheck): Promise<CredentialRecheckRefusal | null> {
  try {
    await service.authorizeSessionCredentials({
      sessionId: payload.authSessionId,
      password: payload.authorizationPassword,
      pin: payload.authorizationPin,
      totp: payload.authorizationTotp
    });
    return null;
  } catch (error) {
    return { ok: false, requiresRecheck: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Whether an account update changes what the account can do, rather than how it
 * reads. Presence decides it, as the request carries only the fields being
 * changed.
 */
function changesAuthority(payload: UpdateIdentityUserRequest): boolean {
  return payload.roleId !== undefined || payload.enabled !== undefined;
}

export function registerIdentityAccessApi(registry: GlobalProgramApiRegistry, service: IdentityAccessService): void {
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.snapshot,
    permission: "programs.read",
    classification: "read",
    action: "iam:Snapshot",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
    handler: async () => ({
      ok: true,
      payload: await service.snapshot()
    })
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.createUser,
    permission: "identity.manage",
    classification: "program-gated",
    action: "iam:CreateUser",
    accessLevel: "PermissionsManagement",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      const payload = request.payload as CreateIdentityUserRequest | undefined;
      if (!payload?.username || !payload.displayName || !payload.roleId) return { ok: false, error: "username, displayName, and roleId are required" };
      // A new account is durable authority: the caller picks its role and its
      // password, and it outlives the session that made it. Changing an
      // existing user's role already re-proves the caller's credentials, so
      // creating an administrator outright cannot ask for less.
      const refusal = await recheckCredentials(service, payload);
      if (refusal) return refusal;
      return { ok: true, payload: await service.upsertUser(payload) };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.updateUser,
    permission: "identity.manage",
    classification: "program-gated",
    action: "iam:UpdateUser",
    accessLevel: "PermissionsManagement",
    resource: endpointResource.user("id"),
    handler: async (request) => {
      const payload = request.payload as UpdateIdentityUserRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      // The gate is on the fields that move authority, not on the endpoint: a
      // role change grants it, and an enable or disable hands it back or takes
      // it from someone relying on it. A disabled administrator that can be
      // switched on again with nothing proved is a dormant escalation. A
      // rename or display-name edit changes no authority and stays open.
      if (changesAuthority(payload)) {
        const refusal = await recheckCredentials(service, payload);
        if (refusal) return refusal;
      }
      return { ok: true, payload: await service.updateUser(payload) };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.setPassword,
    permission: "identity.manage",
    classification: "program-gated",
    action: "iam:SetPassword",
    accessLevel: "Write",
    resource: endpointResource.user("userId"),
    handler: async (request) => {
      const payload = request.payload as SetIdentitySecretRequest | undefined;
      if (!payload?.userId || !payload.value) return { ok: false, error: "userId and value are required" };
      return { ok: true, payload: await service.setPasswordAuthorized({
        userId: payload.userId,
        password: payload.value,
        sessionId: payload.authSessionId,
        authorizationPassword: payload.authorizationPassword,
        authorizationPin: payload.authorizationPin,
        authorizationTotp: payload.authorizationTotp
      }) };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.setPin,
    permission: "identity.manage",
    classification: "program-gated",
    action: "iam:SetPin",
    accessLevel: "Write",
    resource: endpointResource.user("userId"),
    handler: async (request) => {
      const payload = request.payload as SetIdentitySecretRequest | undefined;
      if (!payload?.userId || !payload.value) return { ok: false, error: "userId and value are required" };
      return { ok: true, payload: await service.setPinAuthorized({
        userId: payload.userId,
        pin: payload.value,
        sessionId: payload.authSessionId,
        authorizationPassword: payload.authorizationPassword,
        authorizationPin: payload.authorizationPin,
        authorizationTotp: payload.authorizationTotp
      }) };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.beginTotp,
    permission: "identity.manage",
    classification: "program-gated",
    action: "iam:BeginTotp",
    accessLevel: "Write",
    resource: endpointResource.user("userId"),
    handler: async (request) => {
      const payload = request.payload as ({ userId?: string } & CredentialRecheck) | undefined;
      if (!payload?.userId) return { ok: false, error: "userId is required" };
      // Enrollment hands out the authenticator secret for the named account and
      // replaces any pending one, so it is gated exactly as disabling is.
      const refusal = await recheckCredentials(service, payload);
      if (refusal) return refusal;
      return { ok: true, payload: await service.beginTotp(payload.userId) };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.confirmTotp,
    permission: "identity.manage",
    classification: "program-gated",
    action: "iam:ConfirmTotp",
    accessLevel: "Write",
    resource: endpointResource.user("userId"),
    handler: async (request) => {
      const payload = request.payload as TotpConfirmRequest | undefined;
      if (!payload?.userId || !payload.code) return { ok: false, error: "userId and code are required" };
      // Confirming overwrites the live authenticator secret, which is what
      // disabling does and more: the account keeps two-factor authentication
      // while the factor has moved to whoever ran the enrollment.
      const refusal = await recheckCredentials(service, payload);
      if (refusal) return refusal;
      return { ok: true, payload: await service.confirmTotp(payload.userId, payload.code) };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.disableTotp,
    permission: "identity.manage",
    classification: "program-gated",
    action: "iam:DisableTotp",
    accessLevel: "Write",
    resource: endpointResource.user("userId"),
    handler: async (request) => {
      const payload = request.payload as ({ userId?: string } & CredentialRecheck) | undefined;
      if (!payload?.userId) return { ok: false, error: "userId is required" };
      const refusal = await recheckCredentials(service, payload);
      if (refusal) return refusal;
      return { ok: true, payload: await service.disableTotp(payload.userId) };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.createSession,
    permission: "identity.manage",
    classification: "program-gated",
    action: "iam:CreateSession",
    accessLevel: "Write",
    resource: endpointResource.user("userId"),
    handler: async (request) => {
      const payload = request.payload as SessionRequest | undefined;
      if (!payload?.userId) return { ok: false, error: "userId is required" };
      // A minted session is a bearer credential for the named user, so it is
      // handed out only to a caller that has just re-proved its own.
      const refusal = await recheckCredentials(service, payload);
      if (refusal) return refusal;
      return { ok: true, payload: await service.createSession(payload.userId, payload.ttlMs) };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.revokeSession,
    permission: "identity.manage",
    classification: "authoring",
    action: "iam:RevokeSession",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      const payload = request.payload as RevokeSessionRequest | undefined;
      const sessionId = typeof payload?.sessionId === "string" && payload.sessionId ? payload.sessionId : undefined;
      const sessionDigest = typeof payload?.sessionDigest === "string" && payload.sessionDigest ? payload.sessionDigest : undefined;
      if ((sessionId === undefined) === (sessionDigest === undefined)) return { ok: false, error: "Exactly one of sessionId or sessionDigest is required" };
      // No recheck: revoking only takes a bearer session away. Gating it would
      // leave a stolen session alive while its owner tried to kill it. The
      // revoker is the caller, an administrator by the permission check above
      // (`identity.manage`), so the digest the snapshot lists is enough and no
      // raw id has to leave the server. The service tells its listeners the
      // raw id and the revoker, so the session's Secret Keys unlock is dropped.
      const revoker = { userId: request.actor?.userId ?? null, administrator: request.actor?.permissions.includes("identity.manage") === true };
      return { ok: true, payload: { revoked: await service.revokeSession(sessionId ?? { digest: sessionDigest ?? "" }, revoker) } };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.unlockVault,
    permission: "identity.manage",
    classification: "program-gated",
    action: "iam:UnlockVault",
    accessLevel: "Write",
    resource: endpointResource.user("userId"),
    handler: async (request) => {
      const payload = request.payload as VaultUnlockRequest | undefined;
      if (!payload?.userId) return { ok: false, error: "userId is required" };
      // The vault credentials travel with `userId`, which the caller chooses;
      // the recheck binds the unlock to the calling session's own credentials.
      const refusal = await recheckCredentials(service, payload);
      if (refusal) return refusal;
      return { ok: true, payload: await service.unlockVault(payload) };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.lockVault,
    permission: "identity.manage",
    classification: "authoring",
    action: "iam:LockVault",
    accessLevel: "Write",
    resource: endpointResource.selfUser(),
    // No recheck: locking only takes access away, and a lock must never be the
    // step that fails when an operator is trying to shut the vault.
    handler: async () => ({ ok: true, payload: await service.lockVault() })
  });
}
