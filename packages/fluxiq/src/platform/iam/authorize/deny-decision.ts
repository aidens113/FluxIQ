import type { IamDecision, IamPrincipal, IamResource } from "../types.ts";

/**
 * An implicit deny of every resource: the decision a failure becomes. The
 * authorizer fails closed, so an error while gathering or compiling policies
 * is this decision, never an allow.
 */
export function denyIamRequest(principal: IamPrincipal, action: string, resources: readonly IamResource[]): IamDecision {
  return {
    principal: principal.frn,
    action,
    decision: "deny",
    matched: "implicit",
    resources: resources.map((resource) => ({ resource: resource.frn, decision: "deny", reason: "implicit-deny", matched: "implicit" })),
    fullAccess: false
  };
}
