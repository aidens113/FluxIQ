import type { IamPolicyStatement } from "@fluxiq/contracts/iam";
import { compileIamCondition } from "./condition.ts";
import { compileIamPatternList } from "./pattern-list.ts";
import type { CompiledIamStatement, IamVariableBindings } from "../types.ts";

const NONE = (): boolean => false;
const ALWAYS = (): boolean => true;

// A positive or negated element (`Action`/`NotAction`, `Resource`/`NotResource`)
// as one predicate. Neither present matches nothing; both present is refused,
// as the grammar refuses it.
function elementMatcher(positive: string | readonly string[] | undefined, negative: string | readonly string[] | undefined, bindings: IamVariableBindings | null, caseInsensitive: boolean, label: string): (value: string) => boolean {
  if (positive !== undefined && negative !== undefined) throw new TypeError(`An IAM statement has both ${label} and Not${label}`);
  if (positive !== undefined) return compileIamPatternList(positive, bindings, caseInsensitive);
  if (negative === undefined) return NONE;
  const excluded = compileIamPatternList(negative, bindings, caseInsensitive);
  return (value) => !excluded(value);
}

/**
 * Compiles one statement of policy `policy` with its variables bound. Actions
 * compare case-insensitively and resources case-sensitively, as in AWS.
 * `NotAction` matches every action none of its patterns matches, and
 * `NotResource` likewise; a `NotResource` pattern that needs an unbound
 * variable excludes nothing. A statement with no resource element (a trust
 * statement) matches no resource. Throws a `TypeError` for a statement with
 * neither `Action` nor `NotAction`, or with both of a pair.
 */
export function compileIamStatement(policy: string, statement: IamPolicyStatement, bindings: IamVariableBindings): CompiledIamStatement {
  if (statement.Action === undefined && statement.NotAction === undefined) throw new TypeError("An IAM statement has neither Action nor NotAction");
  const matchesAction = elementMatcher(statement.Action, statement.NotAction, null, true, "Action");
  const matchesResource = elementMatcher(statement.Resource, statement.NotResource, bindings, false, "Resource");
  const conditionsPass = statement.Condition === undefined ? ALWAYS : compileIamCondition(statement.Condition, bindings);
  return {
    effect: statement.Effect,
    matched: { policy, sid: statement.Sid ?? null },
    matchesAction,
    matchesResource,
    conditionsPass,
    applies: (action, resourceFrn, facts) => matchesAction(action) && matchesResource(resourceFrn) && conditionsPass(facts)
  };
}
