import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { identityAccessSnapshotInput, renameIdentityUserInput, revokeIdentitySessionInput } from "@fluxiq/contracts/program-api-inputs";
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
import { IdentityAuthorityManagedError, IdentityAuthorityUncheckedError } from "../runtime/authority/index.ts";
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
 * The named refusal of a sign-in name, role or on/off change for a person
 * whose authority is held elsewhere (`IdentityAuthorityDelegation`), or `null`
 * when it is held here or the update changes none of the three. Only the delegation's own two refusals are answered; anything else
 * propagates, as any handler error does.
 */
async function authorityRefusal(service: IdentityAccessService, payload: UpdateIdentityUserRequest): Promise<{ ok: false; error: string; errorCode: string } | null> {
  try {
    await service.authority.refuseChangeHeldElsewhere(payload);
    return null;
  } catch (error) {
    if (error instanceof IdentityAuthorityManagedError || error instanceof IdentityAuthorityUncheckedError) return { ok: false, error: error.message, errorCode: error.code };
    throw error;
  }
}

/**
 * `payload` without the fields whose value equals the person's stored one: a
 * value resent unchanged is not a change, so it is not asked about
 * (`authorityRefusal`), not rechecked (`changesAuthority`) and not written.
 * Every later decision then goes by presence on what is left, which is
 * exactly what would change. Compared exactly, because `updateUser` stores
 * each value as sent (no trimming or case folding): a value that would be
 * stored differently is a change. The stored person is read in this request;
 * a dropped field is never written, so a change that lands after the read is
 * not overwritten by it. A person not found is returned whole, so the request
 * fails in `updateUser` as it did before.
 */
async function withoutUnchangedFields(service: IdentityAccessService, payload: UpdateIdentityUserRequest): Promise<UpdateIdentityUserRequest> {
  const stored = (await service.snapshot()).users.find((user) => user.id === payload.id);
  if (!stored) return payload;
  const changes = { ...payload };
  if (changes.username === stored.username) delete changes.username;
  if (changes.displayName === stored.displayName) delete changes.displayName;
  if (changes.roleId === stored.roleId) delete changes.roleId;
  if (changes.enabled === stored.enabled) delete changes.enabled;
  return changes;
}

/**
 * Whether an account update changes what the account can do, rather than how it
 * reads. Presence decides it, on a request already stripped of unchanged
 * values (`withoutUnchangedFields`), so it carries only the fields being
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
    assistant: { input: identityAccessSnapshotInput, summary: "Lists the people, their roles and the sign-in sessions.", phrases: ["who has access", "show sign-in sessions", "list the people"] },
    // Each person is marked with whether `update-user` would refuse their
    // sign-in name, role and on/off, so a client never offers a change that
    // will be refused.
    handler: async () => ({
      ok: true,
      payload: await service.authority.listing(await service.snapshot())
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
    assistant: { hidden: "Adding a person needs their password and the caller's own password, PIN or authenticator code, which are never given to the assistant." },
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
    assistant: { input: renameIdentityUserInput, summary: "Renames a person, by sign-in name or display name. It never changes their role or whether they can sign in. A person with an account keeps their account email as their sign-in name, so only their display name changes here.", phrases: ["rename this person", "change this person's display name"] },
    handler: async (request) => {
      const requested = request.payload as UpdateIdentityUserRequest | undefined;
      if (!requested?.id) return { ok: false, error: "id is required" };
      // A field equal to the person's stored value is not a change: resending
      // an unchanged sign-in name, role or on/off is neither refused, nor
      // rechecked, nor written. A real change is decided as below.
      const payload = await withoutUnchangedFields(service, requested);
      // The gate is on the fields that move authority, not on the endpoint: a
      // role change grants it, and an enable or disable hands it back or takes
      // it from someone relying on it. A disabled administrator that can be
      // switched on again with nothing proved is a dormant escalation. A
      // rename or display-name edit changes no authority and stays open.
      //
      // An account holder's sign-in name, role and on/off are provisioning's
      // (their account email, their memberships' policies and their account's
      // status). Refused by name (`errorCode`) before any credential is spent:
      // a change here would disagree with provisioning's record, and the next
      // provisioning change would undo a role or on/off. Their display name
      // stays open, as anyone's does.
      const heldElsewhere = await authorityRefusal(service, payload);
      if (heldElsewhere) return heldElsewhere;
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
    assistant: { hidden: "Takes a password, which is never given to the assistant." },
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
    assistant: { hidden: "Takes a PIN, which is never given to the assistant." },
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
    assistant: { hidden: "Starts authenticator enrollment, which hands out a secret and needs the caller's own credentials, never given to the assistant." },
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
    assistant: { hidden: "Takes an authenticator code, which is never given to the assistant." },
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
    assistant: { hidden: "Turns off a person's authenticator and needs the caller's own credentials, which are never given to the assistant." },
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
    assistant: { hidden: "Creates a sign-in token for a person and needs the caller's own credentials, which are never given to the assistant." },
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
    assistant: { input: revokeIdentitySessionInput, summary: "Signs one sign-in session out, by the digest the sessions list shows.", phrases: ["sign this session out", "end this sign-in session"], target: { sessionDigest: "sign-in session" } },
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
    assistant: { hidden: "Takes the person's vault password, PIN or authenticator code, which are never given to the assistant." },
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
    assistant: { hidden: "Locks the engine's vault; an operator step a person does not ask for in words." },
    // No recheck: locking only takes access away, and a lock must never be the
    // step that fails when an operator is trying to shut the vault.
    handler: async () => ({ ok: true, payload: await service.lockVault() })
  });
}
