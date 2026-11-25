// A tool call's own keys written inside its `input`, lifted out beside it.
//
// run-mwveg5ls-0266dfe0 step 73 (t1034) closed a press's input after `add` and
// `act`: `{kind: "tool_call", callId, toolId: "core.run_node", input: {node,
// parameters, consequences, add: true, act: "a1"}}`. `act` (and `add`, still read and now
// changing nothing) are said of the step as it is taken (`../evidence-loop-decision.ts`); they belong to the
// call, beside `input`, and the reply was refused unread: "input.add is not a key
// this object takes". It is the mirror of `../tool-call-keys/folded.ts`, which
// moves an input key written beside `input` into it, and it can mean one
// decision only, so it is read as that decision when all of these hold, and only
// then:
//
//   - the decision is a `tool_call` naming an offered tool, with an object `input`;
//   - the key is one of the call's own optional keys (`add`, `act`, `place`);
//   - the tool's own input schema does not declare it (at its top level or in a
//     top-level `oneOf`, `anyOf` or `allOf` variant), so it cannot be the tool's;
//   - the call does not already carry it beside `input`: a value written in its
//     place is never overwritten, and the one inside then stays where it is, to be
//     refused as it always was.
//
// The lifted call then goes through every check one written in place would: the
// key's own pattern, the draft's rules for `add` and `act`, the tool's input check.

import type { AutomationStudioLlmDecisionReadingTool } from "./tool.ts";

/** A tool call's own optional keys: the ones a call carries beside `input` and never inside it. */
const OWN_KEYS: readonly string[] = ["add", "act", "place"];
const VARIANT_KEYWORDS = ["oneOf", "anyOf", "allOf"] as const;

/** The decision with its own keys lifted out of `input`, and the keys lifted; nothing when none was. */
export function automationStudioLlmDecisionOwnKeysLifted(decision: unknown, tools: readonly AutomationStudioLlmDecisionReadingTool[] | undefined): { decision: Record<string, unknown>; keys: string[] } | undefined {
  if (!tools?.length || !isRecord(decision) || decision.kind !== "tool_call" || !isRecord(decision.input)) return undefined;
  const tool = tools.find((offered) => offered.toolId === decision.toolId);
  if (!tool) return undefined;
  const input = decision.input;
  const declared = declaredInputKeys(tool.inputSchema);
  const keys = OWN_KEYS.filter((key) => Object.hasOwn(input, key) && !declared.has(key) && !Object.hasOwn(decision, key));
  if (!keys.length) return undefined;
  const lifted: Record<string, unknown> = {};
  const keptInput: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(decision)) if (key !== "input") define(lifted, key, value);
  for (const [key, value] of Object.entries(input)) define(keys.includes(key) ? lifted : keptInput, key, value);
  lifted.input = keptInput;
  return { decision: lifted, keys };
}

/** Defined, never assigned, so no key can reach a prototype. */
function define(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Every property name the schema declares at its top level or in one of its top-level variants. */
function declaredInputKeys(schema: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  const add = (variant: unknown) => {
    if (isRecord(variant) && isRecord(variant.properties)) for (const key of Object.keys(variant.properties)) keys.add(key);
  };
  add(schema);
  for (const keyword of VARIANT_KEYWORDS) {
    const variants = schema[keyword];
    if (Array.isArray(variants)) variants.forEach(add);
  }
  return keys;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
