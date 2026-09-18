// Reading a route condition out of the words a model wrote, and writing one
// back the same way.
//
// A model states when a block runs as one short line -- `when: state.page.dialog
// exists`, `when: inputs.mode is retry`, `when: page.path contains /orders` --
// and Core turns it into the `AutomationConditionExpression` the router
// evaluates. The line is read forgivingly: an operator has several spellings,
// a value may or may not be quoted, and a path written without `state.` or
// `inputs.` is read as state, because state is what a situation is. What is
// never guessed is the test itself: a line whose test is not one the router
// evaluates is refused with the tests it may use, since a condition read
// wrongly is a Flow that takes the wrong route quietly.
//
// `automationStudioRouteConditionText` is the inverse, used to show a model
// the routes a Flow already has in the words it would write them.
import type { AutomationConditionExpression } from "../../../model/index.ts";
import type { AutomationStudioFlowBootstrapRouteCondition, AutomationStudioFlowBootstrapRouteTest } from "../plan/index.ts";
import { AUTOMATION_STUDIO_ROUTE_CONDITION_FORM, AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS, AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH } from "../plan/index.ts";

export type AutomationStudioRouteConditionReading =
  | { ok: true; condition: AutomationStudioFlowBootstrapRouteCondition }
  | { ok: false; reason: string };

type Test = { operator: AutomationStudioFlowBootstrapRouteTest["operator"]; negate?: true; value: "none" | "text" | "number"; transform?: (value: string) => string };

/**
 * Each spelling of a test, longest first so `is not` is never read as `is`.
 * `negate` wraps the test in a `none` group, which the router evaluates.
 */
const TESTS: ReadonlyArray<readonly [string, Test]> = [
  ["does not exist", { operator: "exists", negate: true, value: "none" }],
  ["is not present", { operator: "exists", negate: true, value: "none" }],
  ["is not showing", { operator: "exists", negate: true, value: "none" }],
  ["is not shown", { operator: "exists", negate: true, value: "none" }],
  ["does not contain", { operator: "contains", negate: true, value: "text" }],
  ["does not include", { operator: "contains", negate: true, value: "text" }],
  ["does not equal", { operator: "not_equals", value: "text" }],
  ["does not match", { operator: "matches", negate: true, value: "text" }],
  ["is greater than", { operator: "greater_than", value: "number" }],
  ["is more than", { operator: "greater_than", value: "number" }],
  ["is less than", { operator: "less_than", value: "number" }],
  ["is fewer than", { operator: "less_than", value: "number" }],
  ["is equal to", { operator: "equals", value: "text" }],
  ["greater than", { operator: "greater_than", value: "number" }],
  ["more than", { operator: "greater_than", value: "number" }],
  ["less than", { operator: "less_than", value: "number" }],
  ["fewer than", { operator: "less_than", value: "number" }],
  ["starts with", { operator: "matches", value: "text", transform: (value) => `^${escapePattern(value)}` }],
  ["ends with", { operator: "matches", value: "text", transform: (value) => `${escapePattern(value)}$` }],
  ["is missing", { operator: "exists", negate: true, value: "none" }],
  ["is absent", { operator: "exists", negate: true, value: "none" }],
  ["is present", { operator: "exists", value: "none" }],
  ["is showing", { operator: "exists", value: "none" }],
  ["is shown", { operator: "exists", value: "none" }],
  ["is open", { operator: "exists", value: "none" }],
  ["is set", { operator: "exists", value: "none" }],
  ["is true", { operator: "became_true", value: "none" }],
  ["is false", { operator: "became_false", value: "none" }],
  ["is like", { operator: "similar_to", value: "text" }],
  ["similar to", { operator: "similar_to", value: "text" }],
  ["not exists", { operator: "exists", negate: true, value: "none" }],
  ["not contains", { operator: "contains", negate: true, value: "text" }],
  ["not equals", { operator: "not_equals", value: "text" }],
  ["is not", { operator: "not_equals", value: "text" }],
  ["contains", { operator: "contains", value: "text" }],
  ["includes", { operator: "contains", value: "text" }],
  ["equals", { operator: "equals", value: "text" }],
  ["matches", { operator: "matches", value: "text" }],
  ["exists", { operator: "exists", value: "none" }],
  ["exist", { operator: "exists", value: "none" }],
  ["is", { operator: "equals", value: "text" }],
  ["!=", { operator: "not_equals", value: "text" }],
  ["==", { operator: "equals", value: "text" }],
  ["=", { operator: "equals", value: "text" }],
  [">", { operator: "greater_than", value: "number" }],
  ["<", { operator: "less_than", value: "number" }],
  ["~", { operator: "matches", value: "text" }]
];

/**
 * One `when:` line as a condition. `and` and `or` join tests outside quotes;
 * a line may use one of them, not both, because which binds tighter is a
 * guess this reader will not make. A leading `not` negates the whole line.
 */
export function readAutomationStudioRouteCondition(text: string): AutomationStudioRouteConditionReading {
  let line = text.trim().replace(/[.;]\s*$/u, "");
  if (!line) return { ok: false, reason: `The condition is empty. ${AUTOMATION_STUDIO_ROUTE_CONDITION_FORM}` };
  let negateAll = false;
  const leadingNot = /^not\s+/iu.exec(line);
  if (leadingNot && !/^not\s+(?:exists?|contains|equals)\b/iu.test(line)) {
    negateAll = true;
    line = line.slice(leadingNot[0].length);
  }
  const split = splitOutsideQuotes(line);
  if (!split.ok) return split;
  if (split.parts.length > AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS.maxGroupSize) {
    return { ok: false, reason: `A condition joins at most ${AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS.maxGroupSize} tests.` };
  }
  const tests: AutomationStudioFlowBootstrapRouteCondition[] = [];
  for (const part of split.parts) {
    const read = readTest(part);
    if (!read.ok) return read;
    tests.push(read.condition);
  }
  const joined: AutomationStudioFlowBootstrapRouteCondition = tests.length === 1 ? tests[0]! : { type: split.joiner === "or" ? "any" : "all", conditions: tests };
  return { ok: true, condition: negateAll ? { type: "none", conditions: [joined] } : joined };
}

/** Several `when:` lines on one block: every one must hold. */
export function combineAutomationStudioRouteConditions(conditions: readonly AutomationStudioFlowBootstrapRouteCondition[]): AutomationStudioFlowBootstrapRouteCondition | undefined {
  if (conditions.length <= 1) return conditions[0];
  return { type: "all", conditions: [...conditions] };
}

/** A condition in the words a `when:` line would write it. */
export function automationStudioRouteConditionText(expression: AutomationConditionExpression | undefined): string {
  if (!expression) return "always (no condition)";
  if ("conditions" in expression) {
    const parts = expression.conditions.map((child) => ("conditions" in child ? `(${automationStudioRouteConditionText(child)})` : automationStudioRouteConditionText(child)));
    if (expression.type === "none") return parts.length === 1 ? negatedText(expression.conditions[0]!) : `not (${parts.join(" or ")})`;
    if (expression.type === "any") return parts.join(" or ");
    return parts.join(" and ");
  }
  const value = expression.expected === undefined ? "" : ` ${typeof expression.expected === "string" ? JSON.stringify(expression.expected) : String(expression.expected)}`;
  const words: Record<string, string> = {
    equals: "is", not_equals: "is not", exists: "exists", greater_than: "greater than", less_than: "less than",
    contains: "contains", matches: "matches", similar_to: "is like", became_true: "is true", became_false: "is false"
  };
  const word = words[expression.operator] ?? expression.operator;
  return word === "exists" || word === "is true" || word === "is false" ? `${expression.signalPath} ${word}` : `${expression.signalPath} ${word}${value}`;
}

function negatedText(child: AutomationConditionExpression): string {
  if (!("conditions" in child)) {
    if (child.operator === "exists") return `${child.signalPath} is missing`;
    if (child.operator === "contains") return `${child.signalPath} does not contain ${JSON.stringify(child.expected ?? "")}`;
    if (child.operator === "matches") return `${child.signalPath} does not match ${JSON.stringify(child.expected ?? "")}`;
  }
  return `not (${automationStudioRouteConditionText(child)})`;
}

function readTest(text: string): AutomationStudioRouteConditionReading {
  const trimmed = text.trim();
  const pathMatch = /^[`"']?([A-Za-z][A-Za-z0-9_.-]*)[`"']?\s*/u.exec(trimmed);
  if (!pathMatch) return { ok: false, reason: `"${bounded(trimmed)}" names no path. ${AUTOMATION_STUDIO_ROUTE_CONDITION_FORM}` };
  const signalPath = routePath(pathMatch[1]!);
  if (!AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH.test(signalPath)) {
    return { ok: false, reason: `"${bounded(pathMatch[1]!)}" is not a path a condition can read. ${AUTOMATION_STUDIO_ROUTE_CONDITION_FORM}` };
  }
  const rest = trimmed.slice(pathMatch[0].length).trim();
  const lowered = rest.toLowerCase();
  const found = TESTS.find(([spelling]) => lowered === spelling || lowered.startsWith(spelling) && (/^[^a-z]/u.test(spelling) || /\s/u.test(lowered.charAt(spelling.length))));
  if (!found) return { ok: false, reason: `"${bounded(trimmed)}" states no test the router can make. ${AUTOMATION_STUDIO_ROUTE_CONDITION_FORM}` };
  const [spelling, test] = found;
  const written = unquoted(rest.slice(spelling.length).trim());
  let expected: string | number | boolean | undefined;
  if (test.value === "none") {
    if (written) return { ok: false, reason: `"${bounded(trimmed)}": this test takes no value. ${AUTOMATION_STUDIO_ROUTE_CONDITION_FORM}` };
  } else if (!written) {
    return { ok: false, reason: `"${bounded(trimmed)}" needs a value to test against. ${AUTOMATION_STUDIO_ROUTE_CONDITION_FORM}` };
  } else if (test.value === "number") {
    const number = Number(written.replace(/,/gu, ""));
    if (!Number.isFinite(number)) return { ok: false, reason: `"${bounded(trimmed)}" compares with something that is not a number.` };
    expected = number;
  } else if (written.length > AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS.maxExpectedLength) {
    return { ok: false, reason: "The value a condition tests against is too long." };
  } else {
    const value = test.transform ? test.transform(written) : written;
    expected = (test.operator === "equals" || test.operator === "not_equals") && (value === "true" || value === "false") ? value === "true" : value;
  }
  if (test.operator === "matches" && typeof expected === "string" && !compiles(expected)) {
    return { ok: false, reason: `"${bounded(trimmed)}" is not a pattern that can be matched.` };
  }
  const condition: AutomationStudioFlowBootstrapRouteTest = { signalPath, operator: test.operator, ...(expected === undefined ? {} : { expected }) };
  return { ok: true, condition: test.negate ? { type: "none", conditions: [condition] } : condition };
}

/** A path as the router reads it: `inputs.` and `state.` kept, `input.` read as `inputs.`, anything else as state. */
function routePath(written: string): string {
  const path = written.replace(/\.+$/u, "");
  if (/^inputs\./u.test(path) || /^state\./u.test(path)) return path;
  if (/^input\./u.test(path)) return `inputs.${path.slice("input.".length)}`;
  return `state.${path}`;
}

function splitOutsideQuotes(line: string): { ok: true; parts: string[]; joiner: "and" | "or" } | { ok: false; reason: string } {
  const parts: string[] = [];
  const joiners = new Set<"and" | "or">();
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      // An apostrophe inside a word ("What's") is not a quote.
      if (character === "'" && /[A-Za-z]/u.test(line[index - 1] ?? "") && /[A-Za-z]/u.test(line[index + 1] ?? "")) continue;
      quote = character;
      continue;
    }
    const joiner = /^\s+(and|or|&&|\|\|)\s+/iu.exec(line.slice(index));
    if (!joiner) continue;
    const word = joiner[1]!.toLowerCase();
    joiners.add(word === "and" || word === "&&" ? "and" : "or");
    parts.push(line.slice(start, index));
    index += joiner[0].length - 1;
    start = index + 1;
  }
  parts.push(line.slice(start));
  if (joiners.size > 1) return { ok: false, reason: "A condition mixes `and` with `or`; write one `when:` line per group, or use one of them." };
  return { ok: true, parts: parts.map((part) => part.trim()).filter(Boolean), joiner: joiners.has("or") ? "or" : "and" };
}

function unquoted(text: string): string {
  const match = /^(["'`])([\s\S]*)\1$/u.exec(text);
  return (match ? match[2]! : text).trim();
}

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function bounded(text: string): string {
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}
