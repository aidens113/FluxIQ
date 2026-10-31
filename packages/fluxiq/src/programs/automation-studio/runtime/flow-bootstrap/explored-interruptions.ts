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

//
// **A trial pass is a close too (P6, t799).** A layer a trial's attempt met and
// the run closed (`clearedLayers` on the attempt, carrying the layer's name, the
// definition of the step that pressed its way out and the client's durable
// target for that press) is recorded by `trial`, beside the explored presses,
// and becomes the same kind of handler on the next submission
// (`./layer-handlers/trial.ts`). A layer without all three is ignored, never
// refused; two closes of one layer are one record, keyed by `id ?? name`.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor/index.ts";

/** One layer a trial pass met and the run closed (header). */
export type AutomationStudioTrialInterruption = {
  kind: "trial_close";
  /** The layer's own identity when the client gave one; the key and the fact choice follow it. */
  id?: string;
  /** The layer's name as the page view labels it. */
  name: string;
  /** The node definition a step pressing the way out runs. */
  wayOutDefinitionId: string;
  /** The parameters the domain ran the press with, resolved: what `wayOutDefinitionId`'s node runs with. */
  controlRef: JsonObject;
};

/** One recorded close: an explored press, or a layer a trial pass met (header). */
export type AutomationStudioExploredInterruption = AutomationStudioExploredPress | AutomationStudioTrialInterruption;

/** One explored press that cleared a layer covering the page (header). */
export type AutomationStudioExploredPress = {
  kind?: undefined;
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
const MADE = new WeakMap<object, AutomationStudioExploredInterruptions>();

/** Every explored press the domain answered as clearing a layer, oldest first (header). */
export class AutomationStudioExploredInterruptions {
  private readonly records: AutomationStudioExploredInterruption[] = [];

  /** The build's one record: the environment's own when it carries one, else one kept for that environment, so every brief and trial of a project build tell and read the same (header). */
  static of(environment: object & { readonly exploredInterruptions?: unknown }): AutomationStudioExploredInterruptions {
    const shared = environment.exploredInterruptions;
    if (shared instanceof AutomationStudioExploredInterruptions) return shared;
    const known = MADE.get(environment);
    if (known) return known;
    const made = new AutomationStudioExploredInterruptions();
    MADE.set(environment, made);
    return made;
  }

  /** Records each cleared layer of the trial's attempts that has a name, a way-out definition and a control target; others are ignored (header). `graph` is accepted beside the toggles' call and not read. */
  trial(attempts: readonly AutomationStudioNodeAttemptTrace[], _graph?: unknown): void {
    for (const attempt of attempts) {
      if (attempt.skipped) continue;
      for (const layer of attempt.clearedLayers ?? []) {
        const { name, wayOutDefinitionId, controlRef, id } = layer;
        if (!name || !wayOutDefinitionId || !NODE_ID.test(wayOutDefinitionId)) continue;
        const target = objectOf(controlRef);
        if (!target || !Object.keys(target).length || tooLong(target)) continue;
        const key = id ?? name;
        if (this.records.some((record) => record.kind === "trial_close" && (record.id ?? record.name) === key)) continue;
        this.records.push({ kind: "trial_close", ...(id ? { id } : {}), name, wayOutDefinitionId, controlRef: structuredClone(target) });
        if (this.records.length > MAX_RECORDS) this.records.shift();
      }
    }
  }

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
