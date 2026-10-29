import type { IamMatchedStatement, IamPolicy, IamPrincipal, IamRequestContext } from "../types.ts";
import { compileIamPatternList, compileIamStatement } from "./compile/index.ts";
import type { IamVariableBindings } from "./types.ts";

const ASSUME_ROLE = "iam:AssumeRole";

/**
 * Whether a role's trust policy lets `caller` assume it: the first `Allow`
 * statement whose `Principal.FluxIQ` patterns match `caller.frn`
 * (case-sensitively, with `${fluxiq:PrincipalId}` bound to `caller.id` and
 * `${fluxiq:WorkspaceId}` to `context.workspaceId`), whose action matches
 * `iam:AssumeRole`, and whose conditions pass for the caller and request (no
 * resource, so resource keys are missing). A matching `Deny` wins and returns
 * null, as does no matching `Allow`. Throws a `TypeError` for a policy that is
 * not a trust policy.
 */
export function iamTrustAllows(trust: IamPolicy, caller: IamPrincipal, context: IamRequestContext): IamMatchedStatement | null {
  if (trust.kind !== "trust") throw new TypeError(`IAM policy ${trust.name} is a ${trust.kind} policy, not a trust policy`);
  const bindings: IamVariableBindings = { "${fluxiq:PrincipalId}": caller.id, "${fluxiq:WorkspaceId}": context.workspaceId };
  const facts = { principal: caller, resource: null, context };
  let allowed: IamMatchedStatement | null = null;
  for (const statement of trust.document.Statement) {
    if (statement.Principal === undefined) continue;
    const callerMatches = compileIamPatternList(statement.Principal.FluxIQ, bindings, false);
    const compiled = compileIamStatement(trust.name, statement, bindings);
    if (!callerMatches(caller.frn) || !compiled.matchesAction(ASSUME_ROLE) || !compiled.conditionsPass(facts)) continue;
    if (compiled.effect === "Deny") return null;
    allowed ??= compiled.matched;
  }
  return allowed;
}
