// What a node call asks, with how long it waits taken out.
//
// **The failure this closes (run-mwc6ut8u-52e3c1b3, R6).** Both repeat keys
// held a node's parameters whole, so a press refused as `same_result` ran
// again once its wait bound changed: the model sent the same press with
// another `timeoutMs` thirteen times, each landing where the last had. How long
// a node waits for its act bounds the waiting, not the act: the same press with
// a longer wait presses the same control on the same page.
//
// **Which parameters.** Those the node's own definition declares as timing
// (`AutomationNodeParameter`, through the caller's `timingOf`), never a name
// Core knows: Core holds no list of a domain's parameters, and a node that
// declares none keeps every parameter in its key. Only `core.run_node`'s
// `parameters` are read, since that is where a call names a node and what it
// acts with.
//
// **A timeout keeps them.** After a call that timed out, waiting longer is the
// one change that may get it through, so the timing taken out is kept beside
// the key (`timing`), and the guard runs the call again when it differs
// (`./outcomes.ts`, `timedOutWith`).

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";

/** The tool that runs one node by its id, with its parameters. */
const RUN_NODE = "core.run_node";

/** The parameters a node declares as timing, by the node's id; nothing for a node unknown or declaring none. */
export type AutomationStudioLlmEvidenceTimingOf = (node: string) => readonly string[] | undefined;

/**
 * `input` without the timing members of its node's parameters (`asks`), and
 * those members in canonical form where there were any. `node` names the node
 * where `input` does not: what a call really ran with (`draft.ranWith`) holds
 * its parameters, and the call as written names the node.
 */
export function automationStudioLlmEvidenceTimingFree(toolId: string, input: JsonObject, timingOf: AutomationStudioLlmEvidenceTimingOf | undefined, node: JsonValue | undefined = input.node): { asks: JsonObject; timing?: string } {
  if (timingOf === undefined || toolId !== RUN_NODE || typeof node !== "string") return { asks: input };
  const parameters = input.parameters;
  if (!isObject(parameters)) return { asks: input };
  const names = timingOf(node);
  if (!names?.length) return { asks: input };
  const kept: JsonObject = {};
  const timing: JsonObject = {};
  for (const [name, value] of Object.entries(parameters)) {
    if (names.includes(name)) timing[name] = value;
    else kept[name] = value;
  }
  if (!Object.keys(timing).length) return { asks: input };
  return { asks: { ...input, parameters: kept }, timing: automationStudioLlmEvidenceCanonicalJson(timing) };
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
