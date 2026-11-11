import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { humannessSchema } from "@fluxiq/contracts/automation";
import { identityAccessSnapshotInput, renameIdentityUserInput, revokeIdentitySessionInput } from "@fluxiq/contracts/program-api-inputs";
import { endpointResource } from "../../_shared/iam/index.ts";
import {
  IDENTITY_ACCESS_ENDPOINTS,
  IDENTITY_PREFERENCES_ERRORS,
  type CreateIdentityUserRequest,
  type MyPreferencesResponse,
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

/** A preferences request's refusal, by its named code. */
type PreferencesRefusal = { ok: false; error: string; errorCode: string };

const SELF_ONLY: PreferencesRefusal = {
  ok: false,
  error: "Preferences are only ever your own: the request may carry startingHumanness and nothing else, never a person.",
  errorCode: IDENTITY_PREFERENCES_ERRORS.selfOnly
};
const STARTING_HUMANNESS_INVALID: PreferencesRefusal = {
  ok: false,
  error: "startingHumanness is a whole number from 0 to 100, or null to clear it.",
  errorCode: IDENTITY_PREFERENCES_ERRORS.startingHumannessInvalid
};

/**
 * A preferences request's fields, or its refusal. The person is never read
 * from the payload: any field but `startingHumanness` (`userId`, `id`, `user`,
 * the caller's own id included) refuses the request, except the panel route's
 * own `authSessionId`, which must be the caller's session. `fields` lists what
 * this endpoint takes.
 */
function readPreferencesPayload(payload: unknown, sessionId: string, fields: readonly string[]): { ok: true; body: Record<string, unknown> } | PreferencesRefusal {
  if (payload === undefined || payload === null) return { ok: true, body: {} };
  if (typeof payload !== "object" || Array.isArray(payload)) return SELF_ONLY;
  const body = payload as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (key === "authSessionId" && body.authSessionId === sessionId) continue;
    if (!fields.includes(key)) return SELF_ONLY;
  }
  return { ok: true, body };
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
    assistant: { input: renameIdentityUserInput, summary: "Renames a person, by sign-in name or display name. It never changes their role or whether they can sign in.", phrases: ["rename this person", "change this person's display name"] },
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
  // The caller's own preferences. Every signed-in person holds `programs.read`
  // (the viewer role holds nothing else), so the permission is no gate between
  // people: the endpoint is, as it reads and writes only `request.actor.userId`
  // and refuses a payload naming anyone. The resource is the caller's own user.
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.getMyPreferences,
    permission: "programs.read",
    classification: "read",
    action: "iam:GetMyPreferences",
    accessLevel: "Read",
    resource: endpointResource.selfUser(),
    assistant: { hidden: "A person's own settings, read on their settings page; the assistant has no use for them." },
    handler: async (request) => {
      const actor = request.actor;
      if (!actor) return { ok: false, error: "Authentication is required for this program operation.", errorCode: "authorization.required" };
      const read = readPreferencesPayload(request.payload, actor.sessionId, []);
      if (!read.ok) return read;
      const payload: MyPreferencesResponse = { startingHumanness: await service.preferences.startingHumanness(actor.userId) };
      return { ok: true, payload };
    }
  });
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.updateMyPreferences,
    permission: "programs.read",
    classification: "authoring",
    action: "iam:UpdateMyPreferences",
    accessLevel: "Write",
    resource: endpointResource.selfUser(),
    assistant: { hidden: "A person's own settings, changed by them on their settings page, never by the assistant." },
    // No recheck: it changes how the person's own runs are paced, nothing any
    // other person relies on, and grants no authority.
    handler: async (request) => {
      const actor = request.actor;
      if (!actor) return { ok: false, error: "Authentication is required for this program operation.", errorCode: "authorization.required" };
      const read = readPreferencesPayload(request.payload, actor.sessionId, ["startingHumanness"]);
      if (!read.ok) return read;
      if (!Object.hasOwn(read.body, "startingHumanness")) return STARTING_HUMANNESS_INVALID;
      const value = read.body.startingHumanness;
      if (value !== null && !humannessSchema.safeParse(value).success) return STARTING_HUMANNESS_INVALID;
      const payload: MyPreferencesResponse = { startingHumanness: await service.preferences.setStartingHumanness(actor.userId, value as number | null) };
      return { ok: true, payload };
    }
  });
}
