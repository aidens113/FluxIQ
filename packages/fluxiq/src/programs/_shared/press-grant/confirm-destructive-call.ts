import type { IdentityAccessService } from "../../identity-access/index.ts";
import type { ProgramApiActor, ProgramApiRequest } from "../api.ts";
import { authorizeProgramPin } from "../authorization.ts";
import type { PressGrantStore } from "./press-grant-store.ts";
import { PRESS_GRANT_REFUSALS } from "./refusals.ts";

/**
 * Confirms one `destructive` call before its handler runs, or throws the
 * refusal. `GlobalProgramApiRegistry.call` runs it after IAM allowed the call,
 * so a caller who may not act learns nothing here.
 *
 * 1. The panel assistant's own payload may carry no confirmation (`pressGrant`
 *    or `authorizationPin`): whatever is in it, the model wrote. Its call is
 *    confirmed only by a grant server code hands over as `request.pressGrant`
 *    after the person's own press.
 * 2. A PIN, when the payload carries one, is checked as before (the session
 *    named by `authSessionId`). `carriesPin` is the caller's one reading of
 *    that (`payloadCarriesPin`), the same that chose whether the payload was
 *    read as sent, so a payload cannot answer the question twice differently.
 * 3. Otherwise the actor's own panel session must be live and the actor's. A
 *    person who turned a PIN on confirms with it, never with a press; anyone
 *    else confirms with a press grant, which is spent here even if the handler
 *    then fails, and must match this session, person, endpoint and payload.
 *    A session the route added to the payload must be the actor's own.
 */
export async function confirmDestructiveCall(input: {
  identityAccess: IdentityAccessService | undefined;
  grants: PressGrantStore;
  request: ProgramApiRequest;
  actor: ProgramApiActor;
  carriesPin: boolean;
}): Promise<void> {
  const { identityAccess, grants, request, actor } = input;
  if (!identityAccess) throw new Error(PRESS_GRANT_REFUSALS.unavailable);
  const payload = payloadRecord(request.payload);
  if (request.via === "assistant" && (input.carriesPin || payload.pressGrant !== undefined || payload.authorizationPin !== undefined)) {
    throw new Error(PRESS_GRANT_REFUSALS.personOnly);
  }
  if (input.carriesPin) {
    await authorizeProgramPin(identityAccess, payload);
    return;
  }
  const person = await identityAccess.validateSession(actor.sessionId);
  if (!person || person.user.id !== actor.userId) throw new Error(PRESS_GRANT_REFUSALS.signIn);
  if (person.user.pinConfigured === true) throw new Error(PRESS_GRANT_REFUSALS.pinRequired);
  const grant = request.pressGrant ?? payload.pressGrant;
  if (grant === undefined) throw new Error(PRESS_GRANT_REFUSALS.pressAllow);
  const spent = grants.consume(grant, { sessionId: actor.sessionId, actorId: actor.userId, programId: request.programId, endpoint: request.endpoint, payload: request.payload });
  const ownSession = payload.authSessionId === undefined || payload.authSessionId === actor.sessionId;
  if (!spent || !ownSession) throw new Error(PRESS_GRANT_REFUSALS.pressAgain);
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}
