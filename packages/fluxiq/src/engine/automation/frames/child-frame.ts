// The frame a call starts in its parent's run (state-aware recovery plan, C1).
//
// **A row a call hands over is kept by its own fields.** A frame's inputs are part of what
// makes a lasting act the same act (`../lifecycle-run/act-identity.ts`), and a row read again
// after a route back mints new handles while it stays the same row: an act on it must not
// read as a new one. So the frame keeps what a loop's own identity keeps of a row.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../flows/executable/graph/index.ts";
import { chooseAutomationStudioStartNode } from "../graph-navigation/index.ts";
import type { AutomationStudioInvocationOptions } from "./invocation-options.ts";

/** The name a pass's row goes by in run state; a call hands one over under this input. */
const ROW = "item";
/** A row field minted per read rather than part of the row, as `../lifecycle-run/act-identity.ts` reads one. */
const MINTED_FIELD = /^\$|handle|evidence/iu;

/**
 * A new frame for a graph the node `callNodeId` of the parent frame calls: a
 * Call Subflow child (`subflowId` set) or a Call Flow child (`subflowId: null`).
 * It shares the parent's run holder by reference, so run-level state is never
 * reset by entering it. `undefined` when the parent is unframed, and then the
 * child frames itself as a root.
 */
export function automationStudioChildInvocation(
  parent: AutomationStudioInvocationOptions | undefined,
  child: {
    callNodeId: string;
    subflowId: string | null;
    graph: Pick<AutomationStudioFlowDocument, "flowId" | "nodes" | "edges">;
    graphRevision: number | null;
    inputs: JsonObject;
  }
): AutomationStudioInvocationOptions | undefined {
  if (!parent) return undefined;
  return {
    run: parent.run,
    frame: {
      invocationId: parent.run.nextInvocationId(),
      parentInvocationId: parent.frame.invocationId,
      callNodeId: child.callNodeId,
      subflowId: child.subflowId,
      graphFlowId: child.graph.flowId,
      graphRevision: child.graphRevision,
      entry: { kind: "default" },
      inputs: inputsOf(child.inputs),
      outputs: {},
      cursor: { nodeId: chooseAutomationStudioStartNode(child.graph).node?.id ?? "", phase: "before_attempt" }
    }
  };
}

function inputsOf(inputs: JsonObject): JsonObject {
  const row = inputs[ROW];
  return row === undefined ? { ...inputs } : { ...inputs, [ROW]: ownFields(row) };
}

function ownFields(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(ownFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !MINTED_FIELD.test(key)).map(([key, field]) => [key, ownFields(field)]));
}
