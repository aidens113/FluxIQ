import type { IamPolicyVariable } from "@fluxiq/contracts/iam";
import type { IamMatchedStatement, IamPrincipal, IamRequestContext, IamResource, IamResourceDecision } from "../types.ts";

/**
 * The value each policy variable binds to when a policy set compiles, or null
 * when it has none (`${fluxiq:WorkspaceId}` for a platform-level principal). A
 * pattern or condition value that needs a null variable matches nothing.
 */
export type IamVariableBindings = Readonly<Record<IamPolicyVariable, string | null>>;

/** What a condition reads: the acting principal, the resource (null where there is none, as in a trust check), and the request. */
export type IamConditionFacts = {
  principal: IamPrincipal;
  resource: IamResource | null;
  context: IamRequestContext;
};

/** A statement's whole `Condition`, compiled: true when every operator and every key passes. */
export type CompiledIamCondition = (facts: IamConditionFacts) => boolean;

/** One statement, compiled once per policy set with its variables bound. */
export type CompiledIamStatement = {
  effect: "Allow" | "Deny";
  matched: IamMatchedStatement;
  matchesAction(action: string): boolean;
  matchesResource(resourceFrn: string): boolean;
  conditionsPass: CompiledIamCondition;
  applies(action: string, resourceFrn: string, facts: IamConditionFacts): boolean;
};

/**
 * A policy set compiled for one principal and workspace. `decide` gives the
 * decision for one resource. `fullAccess` is true when the set is an
 * unconditional `Allow *` on the workspace with no `Deny` anywhere (see
 * `compileIamPolicySet`); `coveredByFullAccess` says whether `decide` takes the
 * fast path for a resource, which it does only for one in this workspace that
 * the full-access statements match, so the fast path never changes a decision.
 */
export type CompiledIamPolicySet = {
  fullAccess: boolean;
  decide(action: string, resource: IamResource, context: IamRequestContext): IamResourceDecision;
  coveredByFullAccess(resourceFrn: string): boolean;
};
