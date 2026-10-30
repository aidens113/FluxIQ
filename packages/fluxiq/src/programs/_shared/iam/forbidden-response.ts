import type { Permission } from "../../identity-access/index.ts";
import type { ProgramApiActor, ProgramApiResponse } from "../api.ts";

/**
 * The refusal of a denied decision, in the shape the permission check always
 * returned. When the actor lacks the permission (every deny under `local` and
 * `self-hosted`) the message is today's, word for word; a deny the policies
 * make although the permission is held (`service`) names the action.
 */
export function programForbiddenResponse(actor: ProgramApiActor, permission: Permission, action: string): ProgramApiResponse<never> {
  const error = actor.permissions.includes(permission) ? `Not authorized: ${action}` : `Permission required: ${permission}`;
  return { ok: false, error, errorCode: "authorization.forbidden" };
}
