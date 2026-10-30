import type { AppRouteActor, AppRouteAuthorizer, AppRouteCaller, AppRouteIamContract, AppRoutePermissionName, AppRouteRefusal, AppRouteResourceInput } from "./types";

/**
 * What a `none` route is decided by. `authorize` always takes a permission,
 * and `local` and `self-hosted` decide by it, so a route that checked only
 * authentication is decided with this permission held for the decision: those
 * profiles then allow every authenticated caller, as before, and `service`
 * decides by the caller's policies alone. Remove it when `authorize` takes no
 * permission (reported to the t803 supervisor).
 */
const AUTHENTICATED_ONLY: AppRoutePermissionName = "programs.read";

/**
 * Decides one app route call through `GlobalProgramApiRegistry.authorize`:
 * the contract's action, the permission the route required of this caller,
 * and the resources from `input`. Null when allowed; otherwise the refusal in
 * the routes' own shape (401 without an actor, 403 for a deny and for a
 * failure to decide). Throws when the contract does not accept the caller:
 * the route refuses such a caller before it gets here.
 */
export async function authorizeAppRoute(api: AppRouteAuthorizer, contract: AppRouteIamContract, caller: AppRouteCaller, actor: AppRouteActor, input: AppRouteResourceInput = {}): Promise<AppRouteRefusal | null> {
  const required = contract.callers[caller];
  if (required === undefined) throw new Error(`${contract.method} ${contract.path} does not accept a ${caller} caller`);
  const decided: AppRouteActor = required === "none" ? { ...actor, channel: caller, permissions: [...new Set([...actor.permissions, AUTHENTICATED_ONLY])] } : { ...actor, channel: caller };
  const decision = await api.authorize({
    actor: decided,
    action: contract.action,
    permission: required === "none" ? AUTHENTICATED_ONLY : required,
    resources: contract.resource.of(input),
    ...(contract.programId === undefined ? {} : { programId: contract.programId })
  });
  if (decision.allowed) return null;
  if (decision.response.errorCode === "authorization.required") return { status: 401, error: "Authentication required" };
  return { status: 403, error: decision.response.error ?? `Not authorized: ${contract.action}` };
}
