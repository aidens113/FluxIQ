import type { IamDecision, IamPrincipal, IamRequestContext, IamResource } from "../types.ts";
import type { CompiledIamPolicySet } from "./types.ts";

/**
 * The decision for one request: each resource decided by `compiled.decide`,
 * and the request allowed only when every resource is. No resources is an
 * implicit deny, never a vacuous allow. `matched` is the deciding statement of
 * the first denied resource, or of the first resource when all are allowed.
 * `fullAccess` is true for an allowed request whose every resource took the
 * full-access fast path. `principal` is recorded as `principal.frn`; it should
 * be the principal `compiled` was compiled for, whose facts the conditions
 * read.
 */
export function evaluateIamRequest(compiled: CompiledIamPolicySet, principal: IamPrincipal, action: string, resources: readonly IamResource[], context: IamRequestContext): IamDecision {
  const decisions = resources.map((resource) => compiled.decide(action, resource, context));
  const first = decisions[0];
  if (first === undefined) return { principal: principal.frn, action, decision: "deny", matched: "implicit", resources: [], fullAccess: false };
  const denied = decisions.find((decision) => decision.decision === "deny");
  const deciding = denied ?? first;
  const fullAccess = denied === undefined && resources.every((resource) => compiled.coveredByFullAccess(resource.frn));
  return { principal: principal.frn, action, decision: denied === undefined ? "allow" : "deny", matched: deciding.matched, resources: decisions, fullAccess };
}
