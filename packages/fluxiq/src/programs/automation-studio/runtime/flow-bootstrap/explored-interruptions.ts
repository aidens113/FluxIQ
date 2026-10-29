// The layers this build's presses cleared while exploring (t787 fix 1 of
// `run-mvskptb1-c9cef4fe`): what a submitted Flow needs to close the same
// layer whenever a run meets it again (`./layer-handlers/explored.ts`).
//
// A build that met a layer over the page closed it and carried on, and the site
// remembered: every later trial ran with the layer already gone, so no trial
// could show that the Flow depends on it, and the Flow met it again on a fresh
// account and failed. Only the domain can tell that a press cleared such a
// layer, so it says so on the press's own answer (`evidence.layerCleared`):
// `signature`, an opaque JSON object Core never reads inside, and `control`,
// the handle the press used.
//
// Recorded here, by the build's permission wrapper, which sees every call the
// build makes and what came back (`./action-permissions.ts`), beside the
// explored toggles (`./explored-toggles.ts`): the node the call ran, the
// handles it named, and the parameters the domain ran it with
// (`draft.ranWith.parameters`), which is what the Flow's own step would run
// with. Only a press that declared no lasting consequence is kept, since the
// Flow will press it again with nobody to ask; and anything malformed is not
// recorded, never refused: a press without a cleared layer is an ordinary press.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";

/** One explored press that cleared a layer covering the page (header). */
export type AutomationStudioExploredInterruption = {
  callId?: string;
  /** The node the press ran. */
  node: string;
  /** The handles the press named: the one its `target` was written with, and the one the domain said it used. */
  handles: readonly string[];
  /** The parameters the domain ran the press with, resolved; opaque. */
  parameters: JsonObject;
  /** The domain's opaque word for the layer the press cleared. */
  signature: JsonObject;
};

/** The tool an exploration press is run through (`../llm/node-tools/run-node.ts`). */
const RUN_NODE_TOOL_ID = "core.run_node";
/** A node id, as the registry names one. */
const NODE_ID = /^[A-Za-z0-9_.:-]{1,200}$/u;
/** A handle, as the domain prints one. */
const HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]{0,62}[A-Za-z0-9])?$/u;
/** The longest signature or parameters kept, as JSON: a layer's description and one step's target, never a page. */
const MAX_JSON_CHARS = 8_192;
/** The most presses kept; the oldest goes first. */
const MAX_RECORDS = 64;

/** Every explored press the domain answered as clearing a layer, oldest first (header). */
export class AutomationStudioExploredInterruptions {
  private readonly records: AutomationStudioExploredInterruption[] = [];

  /** Records the call when it ran a node that declared nothing lasting and its answer carries a well-formed `layerCleared` (header). */
  explored(call: { callId?: string | undefined; toolId: string; value: JsonObject }, execution: unknown): void {
    if (call.toolId !== RUN_NODE_TOOL_ID || typeof call.value.node !== "string" || !NODE_ID.test(call.value.node)) return;
    if (!Array.isArray(call.value.consequences) || call.value.consequences.length !== 0) return;
    const result = objectOf(execution);
    const evidence = objectOf(result?.evidence);
    if (!result || result.kind !== "llm_evidence_tool_execution" || !evidence || evidence.ok === false) return;
    const cleared = objectOf(evidence.layerCleared);
    const signature = objectOf(cleared?.signature);
    const control = cleared?.control;
    if (!signature || !Object.keys(signature).length || typeof control !== "string" || !HANDLE.test(control) || tooLong(signature)) return;
    const parameters = objectOf(objectOf(objectOf(result.draft)?.ranWith)?.parameters);
    if (!parameters || !Object.keys(parameters).length || tooLong(parameters)) return;
    const written = objectOf(objectOf(call.value.parameters)?.target)?.handle;
    const handles = [...new Set([control, ...(typeof written === "string" && HANDLE.test(written) ? [written] : [])])];
    this.records.push({
      ...(call.callId ? { callId: call.callId } : {}),
      node: call.value.node,
      handles,
      parameters: structuredClone(parameters),
      signature: structuredClone(signature)
    });
    if (this.records.length > MAX_RECORDS) this.records.shift();
  }

  /** Every recorded press, oldest first, each its own copy. */
  list(): AutomationStudioExploredInterruption[] {
    return structuredClone(this.records);
  }
}

function tooLong(value: JsonObject): boolean {
  return JSON.stringify(value).length > MAX_JSON_CHARS;
}

function objectOf(value: unknown): Record<string, JsonValue> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, JsonValue> : undefined;
}
