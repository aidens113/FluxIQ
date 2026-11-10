import type { IamRequestConsent } from "../../../platform/iam/index.ts";
import type { ProgramApiActor, ProgramApiRequest } from "../api.ts";
import type { PressGrantStore } from "./press-grant-store.ts";

/**
 * How the press grant a destructive call carries was earned (`press` or
 * `words`), read before the call is decided so its audit row can say how the
 * person consented; undefined for a call confirmed by a PIN, one with no
 * grant, or one whose grant would not confirm it. The grant is found where
 * `confirmDestructiveCall` reads it (the assistant's only from server code)
 * and is not spent here: that check still decides the call.
 */
export function pressGrantConsent(input: { grants: PressGrantStore; request: ProgramApiRequest; actor: ProgramApiActor; carriesPin: boolean }): IamRequestConsent | undefined {
  const { grants, request, actor } = input;
  if (input.carriesPin) return undefined;
  const payload = request.payload !== null && typeof request.payload === "object" && !Array.isArray(request.payload) ? (request.payload as Record<string, unknown>) : {};
  const grant = request.via === "assistant" ? request.pressGrant : request.pressGrant ?? payload.pressGrant;
  if (grant === undefined) return undefined;
  return grants.consentOf(grant, { sessionId: actor.sessionId, actorId: actor.userId, programId: request.programId, endpoint: request.endpoint, payload: request.payload });
}
