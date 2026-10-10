// The frame a call starts in its parent's run (state-aware recovery plan, C1).

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { chooseAutomationStudioStartNode } from "../start-node.ts";
import type { AutomationStudioInvocationOptions } from "./invocation-options.ts";

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
      inputs: { ...child.inputs },
      outputs: {},
      cursor: { nodeId: chooseAutomationStudioStartNode(child.graph).node?.id ?? "", phase: "before_attempt" }
    }
  };
}
