// A tool call written flat under its tool's name: `kind` names an offered tool
// and that tool's input keys sit beside it.
//
// run-mwuxd2v9-33928ea3 step 215 (t1025) was asked to decide how to go on and
// wrote `{kind: "loop_decision", decision: ..., question: ..., why: ...}`: the
// tool's name as the kind, its input's keys beside it, no `toolId` and no
// `input`. It can mean one thing only, so it is read as that call when all of
// these hold, and only then:
//
//   - the kind is none of the three a decision may be;
//   - it carries no `toolId`, `input`, `result` or `amendments`, which would
//     make it one of the shapes read elsewhere;
//   - exactly one offered tool's id is the kind, or ends in `.` and the kind;
//   - every other key is the call's own (`callId`, `add`, `act`, `place`) or
//     one that tool's input schema declares.
//
// The read call then goes through every check one written in place would.

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioLlmDecisionDerivedCallId } from "./derived-call-id.ts";
import type { AutomationStudioLlmDecisionReadingTool } from "./tool.ts";

const DECISION_KINDS: ReadonlySet<unknown> = new Set(["tool_call", "complete", "amend_draft"]);
/** Keys whose presence makes the decision another shape, read elsewhere or refused. */
const OTHER_SHAPES: readonly string[] = ["toolId", "input", "result", "amendments"];
/** A tool call's own keys beside its input. */
const OWN_KEYS: ReadonlySet<string> = new Set(["kind", "callId", "add", "act", "place"]);
const VARIANT_KEYWORDS = ["oneOf", "anyOf", "allOf"] as const;
const ID = /^[a-z0-9_.:-]{1,200}$/i;

/** The decision read as a call of the tool its kind names, that tool, and whether its id was derived; nothing when it is not that shape. */
export function automationStudioLlmDecisionFlatToolCall(decision: unknown, tools: readonly AutomationStudioLlmDecisionReadingTool[] | undefined): { decision: Record<string, unknown>; toolId: string; callIdFilled: boolean } | undefined {
  if (!tools?.length || !isRecord(decision) || typeof decision.kind !== "string" || DECISION_KINDS.has(decision.kind)) return undefined;
  if (OTHER_SHAPES.some((key) => Object.prototype.hasOwnProperty.call(decision, key))) return undefined;
  const kind = decision.kind;
  const named = tools.filter((tool) => tool.toolId === kind || tool.toolId.endsWith(`.${kind}`));
  if (named.length !== 1) return undefined;
  const tool = named[0]!;
  const declared = declaredInputKeys(tool.inputSchema);
  const inputKeys = Object.keys(decision).filter((key) => !OWN_KEYS.has(key));
  if (!inputKeys.every((key) => declared.has(key))) return undefined;
  const input: JsonObject = {};
  const read: Record<string, unknown> = { kind: "tool_call" };
  for (const [key, value] of Object.entries(decision)) {
    if (key === "kind") continue;
    // Defined, never assigned, so no key can reach a prototype.
    Object.defineProperty(OWN_KEYS.has(key) ? read : input, key, { value, enumerable: true, writable: true, configurable: true });
  }
  const callIdFilled = !(typeof read.callId === "string" && ID.test(read.callId));
  read.callId = callIdFilled ? automationStudioLlmDecisionDerivedCallId(tool.toolId, input) : read.callId;
  read.toolId = tool.toolId;
  read.input = input;
  return { decision: read, toolId: tool.toolId, callIdFilled };
}

/** Every property name the schema declares at its top level or in one of its top-level variants. */
function declaredInputKeys(schema: JsonObject): Set<string> {
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
