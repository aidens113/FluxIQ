// Writing down one step of a draft that ran a node of the library.
//
// The draft a build accrues used to hold whatever the domain's tools were
// called, and Core could say nothing about any of it: an opaque name and an
// opaque argument. That is still true of a domain tool. It stopped being true
// of the thing this module is for, because the library-as-one-verb
// (`runtime/llm/node-tools/run-node.ts`) is Core's own shape: the call names a
// node of the registry and carries that node's own parameters, so a step taken
// through it is already a step of a Flow and needs no domain to translate it.
//
// So the write is nearly the identity. The node is the node; the parameters are
// the parameters; the declaration of what the step would lastingly do is the
// reserved word `authoring/consequences.ts` reads; and anything the model
// amended onto the step afterwards -- a wait condition, an expected state --
// is written beside them. `assemble.ts` then derives the keys, the ports, the
// edges and the router exactly as it does for a script a model wrote, because
// it is the same assembler.
//
// **Values are written as text because the assembler reads text.** That is not
// a round trip through prose: `authoring/values.ts` reads a JSON object or
// array back as itself, a string verbatim however many colons or braces it
// contains, and a number or a boolean as what it spells. A value with newlines
// in it survives, because an entry carries its lines.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID } from "./run-node.ts";
// A type only, so nothing is imported back out of the directory this one is read by.
import type { AutomationStudioFlowDraftWrittenStep } from "../../flow-bootstrap/index.ts";

/** Where a run-node call keeps the node's own parameters and its declaration. */
const PARAMETERS_KEY = "parameters";
const CONSEQUENCES_KEY = "consequences";

/**
 * One draft step as a written step, or nothing when it is not a step Core can
 * write down.
 *
 * Nothing is guessed. A step taken through a tool Core does not own carries a
 * name Core has never been told the meaning of, so it answers nothing and the
 * assembler reports it rather than leaving it silently out of the result --
 * which is the failure the whole draft exists to make impossible.
 */
export function automationStudioFlowBootstrapDraftNodeStep(step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined {
  if (!automationStudioFlowBootstrapDraftStepIsWritable(step)) return undefined;
  // What it ran with, where that is not what it was written with: a handle is
  // a name for something on a page as it was, and the Flow has to carry what
  // the node actually ran on rather than a name that may stop resolving.
  const parameters = record(step.ranWith?.[PARAMETERS_KEY]) ?? record(step.input[PARAMETERS_KEY]);
  const entries = [
    ...written(parameters),
    // What the model amended onto the step after it ran -- a wait condition, an
    // expected state -- takes precedence over what it ran with, since it is the
    // later statement about the same step.
    ...written(step.settings)
  ];
  const declared = step.input[CONSEQUENCES_KEY];
  return {
    description: `${step.actionId}`,
    node: step.actionId,
    entries: [
      ...entries,
      // Always written, never inferred. A step that declared nothing and a step
      // that declared it causes nothing lasting are different answers, and the
      // gate has to be able to tell them apart.
      ...(Array.isArray(declared) ? [{ key: CONSEQUENCES_KEY, value: declared.length ? declared.join(", ") : "none" }] : [])
    ]
  };
}

/** Each key of an object as one written entry, in the order it was written. */
function written(value: JsonObject | undefined): Array<{ key: string; value: string }> {
  if (!value) return [];
  const entries: Array<{ key: string; value: string }> = [];
  for (const [key, item] of Object.entries(value)) {
    const text = text_(item);
    if (text !== undefined) entries.push({ key, value: text });
  }
  return entries;
}

/** One value as the text the assembler reads it back from. */
function text_(value: JsonValue | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

/**
 * Whether Core can write this step down by itself.
 *
 * It can exactly when the step went through the library verb, because that
 * call's shape is Core's own. A step taken through a domain's own tool carries
 * a name Core has never been told the meaning of, and a draft made of those is
 * not a draft Core can build a Flow from -- so the build falls back to what the
 * reply carried, which is how a host whose actions are not nodes of the
 * registry still builds a Flow.
 */
export function automationStudioFlowBootstrapDraftStepIsWritable(step: AutomationStudioFlowDraftStep): boolean {
  return step.toolId === AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID;
}
