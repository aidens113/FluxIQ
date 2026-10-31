// The presses this build made while exploring that the domain answered as a
// toggle (t775): what a submitted step on the same control needs to be safe to
// run again (`./script-statements/toggle-idempotent.ts`).
//
// Builds stop putting the site back before a trial (user, 2026-10-27), so a
// Flow step that flips a control between two states must not flip it back on a
// site already in the state the step asks for. Only the domain can tell that a
// press flipped such a control, so it says so on the press's own answer, in
// the press's answer (`evidence.toggle`, or `outputs.toggle`): `signature`, an opaque JSON object Core
// never reads inside but for the words it gained and lost (`gains`, `loses`),
// which tie a step that names the control in its other state
// (`./script-statements/toggle-state-words.ts`, t792); the domain later checks the page against it; and
// `idempotentWith`, the id of another node of its library that sets the asked
// state itself, where it has one.
//
// Recorded here, by the build's permission wrapper, which sees every call the
// build makes and what came back (`./action-permissions.ts`): the node the call
// ran, the handle its `target` named as the model wrote it, and the target as
// the domain resolved it (`draft.ranWith.parameters.target`), so a step written
// later can be tied to the press by either. Anything malformed is not recorded,
// never refused: a press without a toggle answer is an ordinary press.
//
// A trial pass is a press too (t787): a step the build submitted that the domain
// answered as a toggle while a trial ran it is recorded from the trial's own
// attempts (`trial`), under the trial node's id (`trialNodes`) and with the
// parameters that node ran with (`trialParameters`, read off the trial's graph,
// Core's `ensureState` taken off), so a later revision of the same step is tied
// to it though its handle was never pressed while exploring. The step is known
// by those parameters, never by its key, which is only its place in the script
// (t792, `./script-statements/toggle-tie.ts`); a trial node the graph does not
// show is recorded without them and ties no step. The answer is read where the
// domain puts it on an executed attempt: its outputs' `toggle`, or the action
// result kept under `result`. An attempt skipped as already in its state
// pressed nothing and says nothing.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor/index.ts";
import type { AutomationStudioExploredToggle } from "./script-statements/index.ts";
import { automationStudioToggleStateSignature, automationStudioToggleStateValueKey } from "../toggle-state/index.ts";

/** The tool an exploration press is run through (`../llm/node-tools/run-node.ts`). */
const RUN_NODE_TOOL_ID = "core.run_node";
/** A node id, as the registry names one. */
const NODE_ID = /^[A-Za-z0-9_.:-]{1,200}$/u;
/** The most presses kept; the oldest goes first. */
const MAX_RECORDS = 256;
/** The longest trial node's parameters kept as its step's identity, as JSON; longer, the press ties no step. */
const MAX_PARAMETERS_CHARS = 16_384;
/** The parameter Core gives a toggle step, never part of the step's identity (header). */
const ENSURE_STATE = "ensureState";

/** The trial's graph, as far as its nodes' written parameters go: every frame's nodes, by executed id. */
type TrialGraph = { readonly nodes: readonly { readonly id: string; readonly parameterValues?: JsonObject | undefined }[] };

/** Every explored press the domain answered as a toggle, oldest first (header). */
export class AutomationStudioExploredToggles {
  private readonly records: AutomationStudioExploredToggle[];

  /** A record starting from `restored`, oldest first: the toggles a build record kept (t792), each its own copy; the newest `MAX_RECORDS` are kept. */
  constructor(restored: readonly AutomationStudioExploredToggle[] = []) {
    this.records = structuredClone(restored.slice(-MAX_RECORDS)) as AutomationStudioExploredToggle[];
  }

  /** Records the call when it ran a node and its answer carries a well-formed `toggle`: on the press's own answer (`evidence.toggle`, as the web domain writes it) or among its outputs (header). */
  explored(call: { callId?: string | undefined; toolId: string; value: JsonObject }, execution: unknown): void {
    if (call.toolId !== RUN_NODE_TOOL_ID || typeof call.value.node !== "string" || !NODE_ID.test(call.value.node)) return;
    const result = objectOf(execution);
    if (!result || result.kind !== "llm_evidence_tool_execution" || objectOf(result.evidence)?.ok === false) return;
    const toggle = objectOf(objectOf(result.evidence)?.toggle) ?? objectOf(objectOf(result.outputs)?.toggle);
    const signature = automationStudioToggleStateSignature(toggle?.signature);
    if (!toggle || !signature) return;
    const beforeSignature = automationStudioToggleStateSignature(toggle.beforeSignature);
    const idempotentWith = typeof toggle.idempotentWith === "string" && NODE_ID.test(toggle.idempotentWith) ? toggle.idempotentWith : undefined;
    const handle = objectOf(objectOf(call.value.parameters)?.target)?.handle;
    const target = objectOf(objectOf(objectOf(result.draft)?.ranWith)?.parameters)?.target;
    this.records.push({
      ...(call.callId ? { callId: call.callId } : {}),
      node: call.value.node,
      handles: typeof handle === "string" && handle.length ? [handle] : [],
      ...(target !== undefined ? { target: structuredClone(target) } : {}),
      signature: structuredClone(signature),
      ...(beforeSignature ? { beforeSignature } : {}),
      ...(idempotentWith ? { idempotentWith } : {})
    });
    if (this.records.length > MAX_RECORDS) this.records.shift();
  }

  /** Records succeeded unskipped trial transitions with written node parameters; deduplication includes both observed states, so richer evidence survives legacy records. */
  trial(attempts: readonly AutomationStudioNodeAttemptTrace[], graph?: TrialGraph | undefined): void {
    const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node] as const));
    for (const attempt of attempts) {
      if (attempt.status !== "succeeded" || attempt.skipped) continue;
      const toggle = objectOf(attempt.outputs.toggle) ?? objectOf(objectOf(attempt.outputs.result)?.toggle);
      const signature = automationStudioToggleStateSignature(toggle?.signature);
      if (!toggle || !signature) continue;
      const beforeSignature = automationStudioToggleStateSignature(toggle.beforeSignature);
      const trialParameters = stepParameters(nodes.get(attempt.nodeId));
      if (this.records.some((record) => record.trialNodes?.includes(attempt.nodeId) && automationStudioToggleStateValueKey(record.signature) === automationStudioToggleStateValueKey(signature)
        && automationStudioToggleStateValueKey(record.beforeSignature ?? null) === automationStudioToggleStateValueKey(beforeSignature ?? null)
        && JSON.stringify(record.trialParameters) === JSON.stringify(trialParameters))) continue;
      const idempotentWith = typeof toggle.idempotentWith === "string" && NODE_ID.test(toggle.idempotentWith) ? toggle.idempotentWith : undefined;
      this.records.push({
        node: attempt.definitionId,
        handles: [],
        trialNodes: [attempt.nodeId],
        ...(trialParameters ? { trialParameters } : {}),
        signature: structuredClone(signature),
        ...(beforeSignature ? { beforeSignature } : {}),
        ...(idempotentWith ? { idempotentWith } : {})
      });
      if (this.records.length > MAX_RECORDS) this.records.shift();
    }
  }

  /** Every recorded press, oldest first, each its own copy. */
  list(): AutomationStudioExploredToggle[] {
    return structuredClone(this.records);
  }
}

/** A trial node's parameters as its step's identity (header): a copy, `ensureState` taken off; none for a node the graph did not show, or too long to keep. */
function stepParameters(node: TrialGraph["nodes"][number] | undefined): JsonObject | undefined {
  if (!node) return undefined;
  const { [ENSURE_STATE]: _core, ...rest } = node.parameterValues ?? {};
  return JSON.stringify(rest).length > MAX_PARAMETERS_CHARS ? undefined : structuredClone(rest);
}

function objectOf(value: unknown): Record<string, JsonValue> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, JsonValue> : undefined;
}
