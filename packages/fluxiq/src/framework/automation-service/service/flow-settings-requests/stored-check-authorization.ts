// Who may set a Flow's standing result-check authorization, and how.
//
// A client's write of the Flow's metadata never sets it: that record says whose
// key and authority pay, so a person who can edit a Flow must not be able to
// name someone else. Whatever is stored stays exactly as it is.
//
// The one way in is a request's own `resultCheckAuthorization`, granted as the
// request's authenticated actor: the person signed in to the panel, or a
// client paired for them (user, 2026-11-16: a connected client has the
// framework's basic model access, so it may authorize a check for its person
// as it may make any other model call for them). The grant records which, and
// every later use is authorized again as that principal.

import { randomUUID } from "node:crypto";
import { AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX } from "../../../../runtime/conversations/commands/index.ts";
import { automationStudioResultCheckGrantRequestOf, grantAutomationStudioResultCheckAuthorization, type AutomationStudioResultCheckAuthorization, type AutomationStudioResultCheckGrantor } from "../../../../runtime/result-verification/check-authorization/index.ts";

/**
 * The stored metadata with the authorization the request may set: the stored
 * one when `granted` is `undefined` (whatever the client's metadata said),
 * none when `null` (withdrawn), or the new grant.
 */
export function withStoredCheckAuthorization(merged: Record<string, any>, stored: Record<string, any> | undefined, granted?: AutomationStudioResultCheckAuthorization | null): Record<string, any> {
  const kept = granted === undefined ? stored?.trainingModeSettings?.resultCheck?.authorization : granted ?? undefined;
  const training = merged.trainingModeSettings;
  if (!training || typeof training !== "object" || Array.isArray(training)) {
    return granted ? { ...merged, trainingModeSettings: { resultCheck: { authorization: granted } } } : merged;
  }
  const check = training.resultCheck;
  if ((!check || typeof check !== "object" || Array.isArray(check)) && kept === undefined) return merged;
  const { authorization: _fromTheClient, ...rest } = check && typeof check === "object" && !Array.isArray(check) ? check : {};
  return { ...merged, trainingModeSettings: { ...training, resultCheck: { ...rest, ...(kept === undefined ? {} : { authorization: kept }) } } };
}

/** The authenticated actor a grant is made as. Never read from a request body. */
export type AutomationStudioResultCheckGrantActor = {
  userId: string;
  sessionId: string;
  channel?: "panel" | "paired-client" | undefined;
  serviceIdentity?: unknown;
};

/**
 * Who is granting: the person, or the paired client acting for them. `null`
 * for anything else -- a service identity, or a client whose pairing the
 * gateway no longer knows -- which may not authorize spending a person's key.
 */
export function automationStudioResultCheckGrantorOf(actor: AutomationStudioResultCheckGrantActor | undefined, trustedClientIdOf: ((gatewaySessionId: string) => string | undefined) | undefined): { userId: string; grantedThrough: AutomationStudioResultCheckGrantor } | null {
  if (!actor?.userId || !actor.sessionId || actor.serviceIdentity !== undefined) return null;
  if (actor.channel === "paired-client" || actor.sessionId.startsWith(AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX)) {
    if (!actor.sessionId.startsWith(AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX)) return null;
    const trustedClientId = trustedClientIdOf?.(actor.sessionId.slice(AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX.length));
    return trustedClientId ? { userId: actor.userId, grantedThrough: { kind: "client", trustedClientId } } : null;
  }
  return { userId: actor.userId, grantedThrough: { kind: "person" } };
}

/**
 * What a request's `resultCheckAuthorization` asks for, as the grant to store:
 * `undefined` when it asks nothing, `null` to withdraw, or the new record.
 * Throws when it asks for a grant its actor may not make.
 */
export function automationStudioResultCheckGrantForRequest(input: {
  value: unknown;
  actor: AutomationStudioResultCheckGrantActor | undefined;
  trustedClientIdOf?: ((gatewaySessionId: string) => string | undefined) | undefined;
  nowMs: number;
}): AutomationStudioResultCheckAuthorization | null | undefined {
  const request = automationStudioResultCheckGrantRequestOf(input.value);
  if (request === undefined || request === null) return request;
  const grantor = automationStudioResultCheckGrantorOf(input.actor, input.trustedClientIdOf);
  if (!grantor) throw new Error("Only a signed-in person, or a client paired for them, can turn on result checking.");
  return grantAutomationStudioResultCheckAuthorization({ authorizationId: `result-check:${randomUUID()}`, userId: grantor.userId, grantedThrough: grantor.grantedThrough, request, nowMs: input.nowMs });
}
