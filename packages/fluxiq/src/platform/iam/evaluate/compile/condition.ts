import { iamConditionKeyValueType, parseIamConditionOperator, type IamConditionOperator, type IamPolicyCondition } from "@fluxiq/contracts/iam";
import { bindIamPolicyVariables } from "../bind-iam-policy-variables.ts";
import { compileIamIpRange } from "./ip-range.ts";
import { compileIamPattern } from "./pattern.ts";
import { resolveIamConditionKey, type IamConditionFact } from "../resolve-iam-condition-key.ts";
import type { CompiledIamCondition, IamConditionFacts, IamVariableBindings } from "../types.ts";

type ValueMatcher = (fact: IamConditionFact) => boolean;
type KeyTest = (facts: IamConditionFacts) => boolean;

const NEGATED: ReadonlySet<IamConditionOperator> = new Set<IamConditionOperator>(["StringNotEquals", "NotIpAddress"]);

function stringEquals(value: string, bindings: IamVariableBindings): ValueMatcher | null {
  const bound = bindIamPolicyVariables(value, bindings);
  if (bound === null) return null;
  return (fact) => fact === bound;
}

function stringLike(value: string, bindings: IamVariableBindings): ValueMatcher | null {
  const pattern = compileIamPattern(value, bindings, false);
  if (pattern === null) return null;
  return (fact) => typeof fact === "string" && pattern.test(fact);
}

function ipAddress(value: string): ValueMatcher | null {
  const range = compileIamIpRange(value);
  if (range === null) return null;
  return (fact) => typeof fact === "string" && range(fact);
}

function date(value: string, before: boolean): ValueMatcher | null {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return null;
  return (fact) => typeof fact === "number" && (before ? fact < instant : fact > instant);
}

// One policy value as a matcher, or null for a value that can match nothing
// (it needs an unbound variable, or does not read as its type).
function valueMatcher(operator: IamConditionOperator, value: string | boolean, bindings: IamVariableBindings): ValueMatcher | null {
  switch (operator) {
    case "StringEquals":
    case "StringNotEquals":
      return stringEquals(String(value), bindings);
    case "StringLike":
      return stringLike(String(value), bindings);
    case "Bool": {
      const expected = value === true || value === "true";
      return (fact) => fact === expected;
    }
    case "IpAddress":
    case "NotIpAddress":
      return ipAddress(String(value));
    case "DateLessThan":
      return date(String(value), true);
    case "DateGreaterThan":
      return date(String(value), false);
  }
}

function keyTest(operatorName: string, key: string, raw: string | boolean | readonly (string | boolean)[], bindings: IamVariableBindings): KeyTest {
  const parsed = parseIamConditionOperator(operatorName);
  if (parsed === null) throw new TypeError(`Unknown IAM condition operator ${JSON.stringify(operatorName)}`);
  const keyType = iamConditionKeyValueType(key);
  if (keyType !== parsed.valueType) throw new TypeError(`IAM condition ${operatorName} cannot compare the key ${JSON.stringify(key)}`);
  const values = typeof raw === "string" || typeof raw === "boolean" ? [raw] : raw;
  const matchers = values.map((value) => valueMatcher(parsed.operator, value, bindings)).filter((matcher): matcher is ValueMatcher => matcher !== null);
  const negated = NEGATED.has(parsed.operator);
  // A missing key, per AWS: an `...IfExists` operator passes; otherwise a
  // negated operator (`StringNotEquals`, `NotIpAddress`) passes, since the
  // request holds no value equal to or inside any listed one, and every other
  // operator fails. So `Deny` + `NotIpAddress` denies a request with no source
  // address, and `Allow` + `StringNotEquals` allows one with no such fact.
  const missing = parsed.ifExists || negated;
  return (facts) => {
    const fact = resolveIamConditionKey(key, facts);
    if (fact === undefined) return missing;
    const matches = matchers.some((matcher) => matcher(fact));
    return negated ? !matches : matches;
  };
}

/**
 * Compiles a statement's `Condition`, AWS style: every operator and every key
 * under it must pass (AND), and a key passes when any of its values matches
 * (OR); `StringNotEquals` and `NotIpAddress` pass when none does. String
 * comparisons are case-sensitive; `StringLike` takes `*` and `?`; policy
 * variables in string values bind here, and a value needing an unbound one
 * matches nothing. `Bool` takes `true` or `"true"`. `DateLessThan` and
 * `DateGreaterThan` compare `fluxiq:CurrentTime` with the instant, strictly.
 * Throws a `TypeError` for an operator or key the grammar refuses, since a
 * parsed document never holds one.
 */
export function compileIamCondition(condition: IamPolicyCondition, bindings: IamVariableBindings): CompiledIamCondition {
  const tests: KeyTest[] = [];
  for (const [operatorName, keys] of Object.entries(condition)) {
    for (const [key, raw] of Object.entries(keys)) tests.push(keyTest(operatorName, key, raw, bindings));
  }
  return (facts) => tests.every((test) => test(facts));
}
