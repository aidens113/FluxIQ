import type { IamRequestVia } from "../../../platform/iam/index.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";
import type { ProgramApiActor, ProgramApiResponse } from "../api.ts";
import { PRESS_GRANT_REFUSALS } from "./refusals.ts";

/**
 * Why this caller may not mint a press grant, or null when it may: only a
 * person, on their own request, signed in to the panel, may. Refused are a
 * call the panel assistant makes (`via: "assistant"`), a caller on any channel
 * but `panel` (a paired client, a key), a session that is not live or not the
 * actor's, and a person who turned a PIN on (their PIN confirms instead, and
 * the page asks for it). Allowed by name, so a new channel is refused until
 * someone decides otherwise.
 */
export async function personPressRefusal(identityAccess: IdentityAccessService | undefined, actor: ProgramApiActor | undefined, via: IamRequestVia | undefined): Promise<ProgramApiResponse<never> | null> {
  if (via !== undefined) return forbidden(PRESS_GRANT_REFUSALS.personOnly);
  if (!actor) return { ok: false, error: "Authentication is required for this program operation.", errorCode: "authorization.required" };
  if (actor.channel !== "panel") return forbidden(PRESS_GRANT_REFUSALS.personOnly);
  if (!identityAccess) return { ok: false, error: PRESS_GRANT_REFUSALS.unavailable };
  const person = await identityAccess.validateSession(actor.sessionId);
  if (!person || person.user.id !== actor.userId) return { ok: false, error: PRESS_GRANT_REFUSALS.signIn, errorCode: "authorization.required" };
  if (person.user.pinConfigured === true) return { ok: false, error: PRESS_GRANT_REFUSALS.pinRequired };
  return null;
}

function forbidden(error: string): ProgramApiResponse<never> {
  return { ok: false, error, errorCode: "authorization.forbidden" };
}
