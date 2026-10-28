// The presses this build made while exploring that the domain answered as a
// toggle (t775): what a submitted step on the same control needs to be safe to
// run again (`./script-statements/toggle-idempotent.ts`).
//
// Builds stop putting the site back before a trial (user, 2026-10-27), so a
// Flow step that flips a control between two states must not flip it back on a
// site already in the state the step asks for. Only the domain can tell that a
// press flipped such a control, so it says so on the press's own answer, in
// the press's answer (`evidence.toggle`, or `outputs.toggle`): `signature`, an opaque JSON object Core
// never reads inside, which the domain later checks the page against; and
// `idempotentWith`, the id of another node of its library that sets the asked
// state itself, where it has one.
//
// Recorded here, by the build's permission wrapper, which sees every call the
// build makes and what came back (`./action-permissions.ts`): the node the call
// ran, the handle its `target` named as the model wrote it, and the target as
// the domain resolved it (`draft.ranWith.parameters.target`), so a step written
// later can be tied to the press by either. Anything malformed is not recorded,
// never refused: a press without a toggle answer is an ordinary press.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioExploredToggle } from "./script-statements/index.ts";

/** The tool an exploration press is run through (`../llm/node-tools/run-node.ts`). */
const RUN_NODE_TOOL_ID = "core.run_node";
/** A node id, as the registry names one. */
const NODE_ID = /^[A-Za-z0-9_.:-]{1,200}$/u;
/** The longest signature kept, as JSON: a state's digest, never a page. */
const MAX_SIGNATURE_CHARS = 4_096;
/** The most presses kept; the oldest goes first. */
const MAX_RECORDS = 256;

/** Every explored press the domain answered as a toggle, oldest first (header). */
export class AutomationStudioExploredToggles {
  private readonly records: AutomationStudioExploredToggle[] = [];

  /** Records the call when it ran a node and its answer carries a well-formed `toggle`: on the press's own answer (`evidence.toggle`, as the web domain writes it) or among its outputs (header). */
  explored(call: { callId?: string | undefined; toolId: string; value: JsonObject }, execution: unknown): void {
    if (call.toolId !== RUN_NODE_TOOL_ID || typeof call.value.node !== "string" || !NODE_ID.test(call.value.node)) return;
    const result = objectOf(execution);
    if (!result || result.kind !== "llm_evidence_tool_execution" || objectOf(result.evidence)?.ok === false) return;
    const toggle = objectOf(objectOf(result.evidence)?.toggle) ?? objectOf(objectOf(result.outputs)?.toggle);
    const signature = objectOf(toggle?.signature);
    if (!toggle || !signature || !Object.keys(signature).length || JSON.stringify(signature).length > MAX_SIGNATURE_CHARS) return;
    const idempotentWith = typeof toggle.idempotentWith === "string" && NODE_ID.test(toggle.idempotentWith) ? toggle.idempotentWith : undefined;
    const handle = objectOf(objectOf(call.value.parameters)?.target)?.handle;
    const target = objectOf(objectOf(objectOf(result.draft)?.ranWith)?.parameters)?.target;
    this.records.push({
      ...(call.callId ? { callId: call.callId } : {}),
      node: call.value.node,
      handles: typeof handle === "string" && handle.length ? [handle] : [],
      ...(target !== undefined ? { target: structuredClone(target) } : {}),
      signature: structuredClone(signature),
      ...(idempotentWith ? { idempotentWith } : {})
    });
    if (this.records.length > MAX_RECORDS) this.records.shift();
  }

  /** Every recorded press, oldest first, each its own copy. */
  list(): AutomationStudioExploredToggle[] {
    return structuredClone(this.records);
  }
}

function objectOf(value: unknown): Record<string, JsonValue> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, JsonValue> : undefined;
}
