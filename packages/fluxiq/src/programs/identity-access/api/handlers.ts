import type { GlobalProgramApiRegistry, ProgramApiResponse } from "../../_shared/api.ts";
import { humannessSchema } from "@fluxiq/contracts/automation";
import { identityAccessSnapshotInput, renameIdentityUserInput, revokeIdentitySessionInput } from "@fluxiq/contracts/program-api-inputs";
import { endpointResource } from "../../_shared/iam/index.ts";
import {
  IDENTITY_ACCESS_ENDPOINTS,
  IDENTITY_PREFERENCES_ERRORS,
  IDENTITY_RECASE_ERRORS,
  type CreateIdentityUserRequest,
  type MyPreferencesResponse,
  type RevokeSessionRequest,
  type SessionRequest,
  type SetIdentitySecretRequest,
  type TotpConfirmRequest,
  type UpdateIdentityUserRequest,
  type VaultUnlockRequest
} from "./contracts.ts";
import { IdentityAuthorityManagedError, IdentityAuthorityUncheckedError } from "../runtime/authority/index.ts";
import type { IdentityAccessService } from "../runtime/service.ts";
import { IdentityUsernameTakenError } from "../runtime/username-taken-error.ts";
import { IdentityUsernameRecaseError, usernameKey } from "../runtime/usernames/index.ts";

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
 * What an `update-user` request changes, read against the person's stored
 * values in this request. `changes` is `payload` without the fields equal to
 * the stored ones: a value resent unchanged is not a change, so it is not
 * asked about (`authorityRefusal`), not rechecked (`changesAuthority`) and not
 * written. All four fields are compared exactly, so a sign-in name that
 * differs from the stored one only by case stays in `changes` and is written
 * as sent. `recasesName` says it is the person's own name in another case
 * (equal under `usernameKey`, as sign-in and the uniqueness check compare
 * names): the same sign-in name of the same person, so no change of
 * authority, for an account holder (whose sign-in name is their account
 * email, the same address in any case) as for anyone, whoever re-cases it;
 * the endpoint's own gate (`identity.manage`) decides who may. A dropped
 * field is never written, so a change that lands after the read is not
 * overwritten by it. A person not found is returned whole, so the request
 * fails in `updateUser` as it did before.
 */
async function changedFields(service: IdentityAccessService, payload: UpdateIdentityUserRequest): Promise<{ changes: UpdateIdentityUserRequest; recasesName: boolean }> {
  const stored = (await service.snapshot()).users.find((user) => user.id === payload.id);
  if (!stored) return { changes: payload, recasesName: false };
  const changes = { ...payload };
  if (changes.username === stored.username) delete changes.username;
  if (changes.displayName === stored.displayName) delete changes.displayName;
  if (changes.roleId === stored.roleId) delete changes.roleId;
  if (changes.enabled === stored.enabled) delete changes.enabled;
  const recasesName = changes.username !== undefined && usernameKey(changes.username) === usernameKey(stored.username);
  return { changes, recasesName };
}

/**
 * Whether an account update changes what the account can do, rather than how it
 * reads. Presence decides it, on a request already stripped of unchanged
 * values (`changedFields`), so it carries only the fields being
 * changed.
 */
function changesAuthority(payload: UpdateIdentityUserRequest): boolean {
  return payload.roleId !== undefined || payload.enabled !== undefined;
}

/**
 * The response for a write of a person: the written person, or the named
 * refusal of a sign-in name another person already has ignoring case
 * (`IdentityUsernameTakenError`, answered as `errorCode`). Anything else
 * propagates, as any handler error does.
 */
async function written(write: () => Promise<unknown>): Promise<ProgramApiResponse> {
  try {
    return { ok: true, payload: await write() };
  } catch (error) {
    if (error instanceof IdentityUsernameTakenError || error instanceof IdentityUsernameRecaseError) return { ok: false, error: error.message, errorCode: error.code };
    throw error;
  }
}

/** A self-only request's refusal (preferences, re-casing one's own name), by its named code. */
type SelfOnlyRefusal = { ok: false; error: string; errorCode: string };

const SELF_ONLY: SelfOnlyRefusal = {
  ok: false,
  error: "Preferences are only ever your own: the request may carry startingHumanness and nothing else, never a person.",
  errorCode: IDENTITY_PREFERENCES_ERRORS.selfOnly
};
const STARTING_HUMANNESS_INVALID: SelfOnlyRefusal = {
  ok: false,
  error: "startingHumanness is a whole number from 0 to 100, or null to clear it.",
  errorCode: IDENTITY_PREFERENCES_ERRORS.startingHumannessInvalid
};
const RECASE_SELF_ONLY: SelfOnlyRefusal = {
  ok: false,
  error: "Only your own sign-in name is changed here: the request may carry username and nothing else, never a person.",
  errorCode: IDENTITY_RECASE_ERRORS.selfOnly
};
const RECASE_NOT_CASE_ONLY: SelfOnlyRefusal = {
  ok: false,
  error: "Only the capitalisation of your sign-in name can change here: send your current sign-in name with different capital letters.",
  errorCode: IDENTITY_RECASE_ERRORS.notCaseOnly
};

/**
 * A self-only request's fields, or `refusal`. The person is never read from
 * the payload: any field not in `fields` (`userId`, `id`, `user`, the caller's
 * own id included) refuses the request, except the panel route's own
 * `authSessionId`, which must be the caller's session.
 */
function readSelfOnlyPayload(payload: unknown, sessionId: string, fields: readonly string[], refusal: SelfOnlyRefusal): { ok: true; body: Record<string, unknown> } | SelfOnlyRefusal {
  if (payload === undefined || payload === null) return { ok: true, body: {} };
  if (typeof payload !== "object" || Array.isArray(payload)) return refusal;
  const body = payload as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (key === "authSessionId" && body.authSessionId === sessionId) continue;
    if (!fields.includes(key)) return refusal;
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
      return written(() => service.upsertUser(payload));
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
      // an unchanged sign-in name, role or on/off is neither refused nor
      // rechecked. A person's sign-in name re-cased, by them or by an
      // administrator, keeps the same name, so it is not asked about either,
      // and is written as sent. A real change is decided as below, and a
      // sign-in name another person has, ignoring case, is refused by name
      // when it is written (`written`).
      const { changes: payload, recasesName } = await changedFields(service, requested);
      const authorityChange = { ...payload };
      if (recasesName) delete authorityChange.username;
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
      // stays open, as anyone's does, and so does re-casing their sign-in
      // name: the same address, so provisioning's record still holds.
      const heldElsewhere = await authorityRefusal(service, authorityChange);
      if (heldElsewhere) return heldElsewhere;
      if (changesAuthority(payload)) {
        const refusal = await recheckCredentials(service, payload);
        if (refusal) return refusal;
      }
      return written(() => service.updateUser(payload, recasesName ? "recase" : "replace"));
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
      const read = readSelfOnlyPayload(request.payload, actor.sessionId, [], SELF_ONLY);
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
      const read = readSelfOnlyPayload(request.payload, actor.sessionId, ["startingHumanness"], SELF_ONLY);
      if (!read.ok) return read;
      if (!Object.hasOwn(read.body, "startingHumanness")) return STARTING_HUMANNESS_INVALID;
      const value = read.body.startingHumanness;
      if (value !== null && !humannessSchema.safeParse(value).success) return STARTING_HUMANNESS_INVALID;
      const payload: MyPreferencesResponse = { startingHumanness: await service.preferences.setStartingHumanness(actor.userId, value as number | null) };
      return { ok: true, payload };
    }
  });
  // The caller's own sign-in name in another case: held exactly as the
  // preferences are (`programs.read`, the caller's own user, the person read
  // only from `request.actor.userId`), so a person who may not call
  // `update-user` can still correct which letters of their name are capitals.
  // Anything but the same name ignoring case is refused before anything is
  // written or compared with another person's name, so the endpoint never
  // says whether a name other than the caller's own is taken.
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.recaseMyUsername,
    permission: "programs.read",
    classification: "authoring",
    action: "iam:RecaseMyUsername",
    accessLevel: "Write",
    resource: endpointResource.selfUser(),
    assistant: { hidden: "A person's own sign-in name, re-cased by them on their sign-in page, never by the assistant." },
    // No recheck and no authority owner asked: the same name of the same
    // person (same id, sessions, memberships and account) moves no authority,
    // as `update-user` decides a re-case. It writes through the same
    // `updateUser`, so the service's uniqueness check (ignoring case) holds.
    handler: async (request) => {
      const actor = request.actor;
      if (!actor) return { ok: false, error: "Authentication is required for this program operation.", errorCode: "authorization.required" };
      const read = readSelfOnlyPayload(request.payload, actor.sessionId, ["username"], RECASE_SELF_ONLY);
      if (!read.ok) return read;
      const username = read.body.username;
      const stored = (await service.snapshot()).users.find((user) => user.id === actor.userId);
      if (typeof username !== "string" || !stored || usernameKey(username) !== usernameKey(stored.username)) return RECASE_NOT_CASE_ONLY;
      return written(() => service.updateUser({ id: actor.userId, username }, "recase"));
    }
  });
}
