// What makes two dispatches of one lasting act the same act (state-aware
// recovery plan, C5; supervisor decision, t411).
//
// The run's completed-act ledger is keyed by this identity: before a lasting
// act executes, a match skips it as already done, so a route back past acts
// that completed never repeats one. The identity is the graph and node plus:
//
// - **The row**, when the node runs per row: the item each list loop
//   (`builtin.control.for-each`) holding the node handed its current pass, and
//   the pass number of each do-while loop (`builtin.control.repeat`) holding
//   it. A per-row act is the same act only on the same row, whatever its
//   target resolves to, and a do-while pass acts on what the page shows that
//   pass.
// - **Otherwise the resolved target and inputs**: the node's parameters
//   resolved as its attempt resolves them (`../node-execution/attempt.ts`),
//   and the values its edges bring to its ports.
//
// Either way the inputs of the frame it runs in count, so a Subflow called
// with other inputs is another act.
//
// A row is read by its own fields: a key that starts with `$` or names a
// handle or evidence reference is left out, because those are minted afresh
// each time a list is read, and a row read again after a route back must
// still be the row it was.

import { createHash } from "node:crypto";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { resolveAutomationNodeParameterValues } from "../../../nodes/index.ts";
import { automationStudioActivityLoops, type AutomationStudioActivityLoop } from "../../activity/loop/index.ts";
import { automationStudioNodeOutputReferences, collectNodeInputs, collectWiredNodeInputs } from "../node-inputs.ts";

const FOR_EACH = "builtin.control.for-each";
const REPEAT = "builtin.control.repeat";

/** A row field minted per read rather than part of the row. */
const MINTED_FIELD = /^\$|handle|evidence/iu;

/** What the identity reads of the run's attempts: which node ran, how it left, and what it output. */
type Attempt = { nodeId: string; route?: string | undefined; outputs: Readonly<Record<string, unknown>> };

/** Each graph's loops, read once per document. */
const loopsByFlow = new WeakMap<AutomationStudioFlowDocument, { lists: AutomationStudioActivityLoop[]; repeats: AutomationStudioActivityLoop[] }>();

/**
 * The identity of `node`'s act if it were dispatched now in `flow`, as a
 * ledger key. `attempts` are the frame's own, in order; `values` the run
 * values; `variables` and `runInputs` what the attempt's parameter resolution
 * layers under them; `frameInputs` the inputs of the frame the node runs in.
 */
export function automationStudioCompletedActIdentity(input: {
  flow: AutomationStudioFlowDocument;
  node: AutomationStudioFlowNode;
  attempts: readonly Attempt[];
  values: Readonly<Record<string, JsonValue>>;
  variables: ReadonlyMap<string, JsonValue>;
  runInputs: Readonly<Record<string, JsonValue>>;
  frameInputs: Readonly<Record<string, JsonValue>>;
}): string {
  const { flow, node } = input;
  const places = loopPlaces(flow, node.id, input.attempts);
  const identity = places.length
    ? { rows: places, frame: input.frameInputs }
    : { target: resolvedTarget(input), wired: collectWiredNodeInputs(flow, node, { ...input.values }), frame: input.frameInputs };
  return `${flow.flowId}/${node.id}/${createHash("sha256").update(stableJson(identity)).digest("hex")}`;
}

/** The node's parameters resolved over the run's state, as its attempt resolves them; with a binding nothing answers, the parameters as written. */
function resolvedTarget(input: Parameters<typeof automationStudioCompletedActIdentity>[0]): JsonValue {
  const { flow, node, values } = input;
  const authored = automationStudioNodeOutputReferences(flow, node.parameterValues ?? {});
  const resolved = resolveAutomationNodeParameterValues(authored, { ...input.runInputs, ...Object.fromEntries(input.variables), ...values, ...collectNodeInputs(flow, node, { ...values }) });
  return resolved.missingPaths.length ? authored : resolved.values;
}

/** Where each loop holding the node is: the row its list loop's current pass is on, the number of its do-while loop's current pass. */
function loopPlaces(flow: AutomationStudioFlowDocument, nodeId: string, attempts: readonly Attempt[]): JsonValue[] {
  let loops = loopsByFlow.get(flow);
  if (!loops) {
    loops = { lists: automationStudioActivityLoops(flow, FOR_EACH), repeats: automationStudioActivityLoops(flow, REPEAT) };
    loopsByFlow.set(flow, loops);
  }
  const places: JsonValue[] = [];
  for (const loop of loops.lists) {
    const pass = currentPass(loop, nodeId, attempts);
    if (pass) places.push({ loop: loop.repeatId, row: rowFields(pass.item) });
  }
  for (const loop of loops.repeats) {
    const pass = currentPass(loop, nodeId, attempts);
    if (pass) places.push({ loop: loop.repeatId, pass: typeof pass.pass === "number" ? pass.pass : null });
  }
  return places;
}

/** The outputs of the loop head's latest `body` attempt, when the node is one of the loop's members. */
function currentPass(loop: AutomationStudioActivityLoop, nodeId: string, attempts: readonly Attempt[]): Readonly<Record<string, unknown>> | undefined {
  if (!loop.members.has(nodeId)) return undefined;
  for (let at = attempts.length - 1; at >= 0; at -= 1) {
    const attempt = attempts[at]!;
    if (attempt.nodeId === loop.repeatId && attempt.route === "body") return attempt.outputs;
  }
  return undefined;
}

/** A row as its own fields, without what a read mints afresh. */
function rowFields(item: unknown): JsonValue {
  if (Array.isArray(item)) return item.map(rowFields);
  if (!item || typeof item !== "object") return (item ?? null) as JsonValue;
  const fields: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(item)) if (!MINTED_FIELD.test(key)) fields[key] = rowFields(value);
  return fields;
}

/** Deterministic JSON: object keys sorted, arrays in order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
