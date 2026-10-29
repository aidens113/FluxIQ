import { isIamActionName, parseFluxIQResourceName, type FluxIQResourceName } from "@fluxiq/contracts/iam";
import type { IamMatchedStatement, IamPolicy, IamPolicySet, IamPrincipal, IamResourceDecision } from "../../types.ts";
import { compileIamStatement } from "./statement.ts";
import { isIamFullAccessStatement } from "../is-iam-full-access-statement.ts";
import type { CompiledIamPolicySet, CompiledIamStatement, IamVariableBindings } from "../types.ts";

type Entry = { statement: CompiledIamStatement; fullAccess: boolean };

const isAllow = (entry: Entry): boolean => entry.statement.effect === "Allow";
const isFullAccess = (entry: Entry): boolean => entry.fullAccess;
const statementOf = (entry: Entry): CompiledIamStatement => entry.statement;

function implicitDeny(resource: string): IamResourceDecision {
  return { resource, decision: "deny", reason: "implicit-deny", matched: "implicit" };
}

// In this workspace: an FRN whose workspace segment is this workspace, or the
// workspace's own FRN (`frn:fluxiq:platform::workspace/<id>`).
function inWorkspace(name: FluxIQResourceName, workspaceId: string): boolean {
  if (name.workspaceId === workspaceId) return true;
  return name.service === "platform" && name.resourceType === "workspace" && name.resourceId === workspaceId;
}

/**
 * Compiles every policy that applies to `principal` in `workspaceId` (null for
 * a platform-level principal) once: wildcard patterns become anchored regular
 * expressions, and `${fluxiq:PrincipalId}` (`principal.id`) and
 * `${fluxiq:WorkspaceId}` (`workspaceId`) are bound into resource patterns and
 * string condition values. `decide` then applies AWS IAM evaluation to one
 * resource:
 *
 * 1. a matching `Deny` in any identity policy, guardrail, session policy or
 *    the boundary denies (`explicit-deny`, citing the first in that order);
 * 2. otherwise the request is allowed only when an identity statement allows
 *    it, every session policy has a statement that allows it, and the
 *    boundary (when there is one) has a statement that allows it (`allowed`,
 *    citing the first identity statement that allowed); a guardrail never
 *    grants, and neither does a session policy or the boundary alone;
 * 3. otherwise `implicit-deny`.
 *
 * An action that is not an action name (`isIamActionName`, so no wildcard) or a
 * resource that is not an FRN is denied implicitly: a request never names a
 * pattern.
 *
 * `fullAccess` is true when the workspace is known, an identity statement is a
 * full-access grant (`isIamFullAccessStatement`), no policy in the set holds a
 * `Deny`, and every session policy and the boundary hold a full-access grant
 * too. `decide` then answers `allowed` at once, citing the identity grant, for
 * a resource in this workspace (or the workspace itself) that every one of
 * those grants matches. With no `Deny` anywhere, the full evaluation would
 * allow that resource as well, so the fast path never changes a decision;
 * only the statement cited can differ (the full-access grant rather than an
 * earlier, narrower identity statement).
 */
export function compileIamPolicySet(set: IamPolicySet, principal: IamPrincipal, workspaceId: string | null): CompiledIamPolicySet {
  const bindings: IamVariableBindings = { "${fluxiq:PrincipalId}": principal.id, "${fluxiq:WorkspaceId}": workspaceId };
  const compile = (policy: IamPolicy): Entry[] =>
    policy.document.Statement.map((statement) => ({ statement: compileIamStatement(policy.name, statement, bindings), fullAccess: isIamFullAccessStatement(statement, workspaceId) }));
  const identity = set.identity.flatMap(compile);
  const guardrails = set.guardrails.flatMap(compile);
  const sessions = set.sessions.map(compile);
  const boundary = set.boundary === null ? null : compile(set.boundary);
  const everything = [...identity, ...guardrails, ...sessions.flat(), ...(boundary ?? [])];
  const denies = everything.filter((entry) => !isAllow(entry)).map(statementOf);
  const identityAllows = identity.filter(isAllow).map(statementOf);
  const sessionAllows = sessions.map((policy) => policy.filter(isAllow).map(statementOf));
  const boundaryAllows = boundary === null ? null : boundary.filter(isAllow).map(statementOf);

  const fullAccessIdentity = identity.filter(isFullAccess).map(statementOf);
  const fullAccessSessions = sessions.map((policy) => policy.filter(isFullAccess).map(statementOf));
  const fullAccessBoundary = boundary === null ? null : boundary.filter(isFullAccess).map(statementOf);
  const fullAccess =
    workspaceId !== null &&
    denies.length === 0 &&
    fullAccessIdentity.length > 0 &&
    fullAccessSessions.every((grants) => grants.length > 0) &&
    (fullAccessBoundary === null || fullAccessBoundary.length > 0);

  const fastPath = (name: FluxIQResourceName, resourceFrn: string): IamMatchedStatement | null => {
    if (!fullAccess || workspaceId === null || !inWorkspace(name, workspaceId)) return null;
    const covers = (grant: CompiledIamStatement): boolean => grant.matchesResource(resourceFrn);
    const grant = fullAccessIdentity.find(covers);
    if (grant === undefined || !fullAccessSessions.every((grants) => grants.some(covers))) return null;
    if (fullAccessBoundary !== null && !fullAccessBoundary.some(covers)) return null;
    return grant.matched;
  };

  const coveredByFullAccess = (resourceFrn: string): boolean => {
    const name = parseFluxIQResourceName(resourceFrn);
    return name !== null && fastPath(name, resourceFrn) !== null;
  };

  const decide: CompiledIamPolicySet["decide"] = (action, resource, context) => {
    const resourceFrn = resource.frn;
    const name = parseFluxIQResourceName(resourceFrn);
    if (name === null || !isIamActionName(action)) return implicitDeny(resourceFrn);
    const grant = fastPath(name, resourceFrn);
    if (grant !== null) return { resource: resourceFrn, decision: "allow", reason: "allowed", matched: grant };
    const facts = { principal, resource, context };
    const applies = (statement: CompiledIamStatement): boolean => statement.applies(action, resourceFrn, facts);
    const deny = denies.find(applies);
    if (deny !== undefined) return { resource: resourceFrn, decision: "deny", reason: "explicit-deny", matched: deny.matched };
    const allow = identityAllows.find(applies);
    if (allow === undefined) return implicitDeny(resourceFrn);
    if (!sessionAllows.every((statements) => statements.some(applies))) return implicitDeny(resourceFrn);
    if (boundaryAllows !== null && !boundaryAllows.some(applies)) return implicitDeny(resourceFrn);
    return { resource: resourceFrn, decision: "allow", reason: "allowed", matched: allow.matched };
  };

  return { fullAccess, decide, coveredByFullAccess };
}
