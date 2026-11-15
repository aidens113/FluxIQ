import { authorizeAppRoute, type AppRouteIamContract, type AppRouteResourceInput } from "../../app-route-iam";
import type { WorkspaceRouteCaller, WorkspaceRouteContext, WorkspaceRouteRefusal } from "./types";

/** Preserves route IAM declarations while distinguishing policy refusal from unavailable policy storage. */
export async function authorizeWorkspaceRoute(fluxiq: WorkspaceRouteContext["fluxiq"], contract: AppRouteIamContract, caller: WorkspaceRouteCaller, resources: AppRouteResourceInput): Promise<WorkspaceRouteRefusal | null> {
  let unavailable = false;
  const refusal = await authorizeAppRoute({ authorize: async input => {
    const result = await fluxiq.programs.api.authorize(input);
    if (!result.allowed && (result.decision?.failure === "policy_unavailable" || (result.response.errorCode !== "authorization.required" && result.response.errorCode !== "authorization.forbidden"))) unavailable = true;
    return result;
  } }, contract, caller.channel, caller.actor, resources);
  if (unavailable) return { ok: false, status: 503, error: "Request authority could not be verified." };
  return refusal ? { ok: false, ...refusal } : null;
}
