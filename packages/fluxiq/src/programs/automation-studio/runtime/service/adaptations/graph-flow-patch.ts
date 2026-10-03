// One adaptation patch written onto a graph Flow, in memory.
//
// The durable appliers (`patches.ts`) save what this returns. A run trying a
// runtime patch before it is kept -- the resume after a repair, which runs the
// unapplied candidate (`../runtime-adaptation/judged-promotion.ts`) -- runs it
// unsaved. It is one function so that the Flow a judged run ran and the Flow
// an apply later stores cannot disagree about what a patch does.
//
// Only the patches that change one graph Flow have a form here: an expectation
// or an action target on a node, and a reroute edge out of a node. Every other
// kind -- a Router or Subflow edit, a created Subflow, a recovery path with no
// durable form -- is refused, as its durable applier would refuse it here.

import { safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { actionTargetParameterValues } from "../../flow-change/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { isJsonRecord } from "../json-values.ts";

/** The graph Flow with `patch` written onto it. Throws, naming why, for a patch it cannot write. */
export function automationStudioGraphFlowWithAdaptationPatch(
  graphFlow: AutomationStudioFlowArtifact,
  adaptation: Pick<AutomationStudioFlowAdaptation, "adaptationId">,
  patch: AutomationStudioFlowAdaptation["patch"][number],
  now: number
): AutomationStudioFlowArtifact {
  if (patch.kind === "edit_expectation" || patch.kind === "edit_action_target") {
    if (!patch.targetId) throw new Error(`Patch ${patch.kind} is missing a target node.`);
    const nodeIndex = graphFlow.nodes.findIndex((node) => node.id === patch.targetId);
    if (nodeIndex < 0) throw new Error(`Unknown Flow node for adaptation patch: ${patch.targetId}`);
    const nodes = structuredClone(graphFlow.nodes);
    const node = nodes[nodeIndex]!;
    const parameterValues = { ...(node.parameterValues ?? {}) };
    if (patch.kind === "edit_expectation") {
      if (!isJsonRecord(patch.after)) throw new Error("Expectation adaptation patches must provide an object after value.");
      node.parameterValues = compactJsonObject({ ...parameterValues, ...patch.after });
    } else {
      if (patch.after === undefined) throw new Error("Action target adaptation patches must provide an after value.");
      node.parameterValues = compactJsonObject({ ...parameterValues, ...actionTargetParameterValues({ nodeId: node.id, definitionId: node.definitionId, parameterValues }, structuredClone(patch.after), adaptation.adaptationId) });
    }
    return { ...graphFlow, nodes, updatedAt: now };
  }
  const toNodeId = patch.kind === "edit_router" && isJsonRecord(patch.after) && typeof patch.after.toNodeId === "string" ? patch.after.toNodeId.trim() : "";
  if (!toNodeId) throw new Error(`Adaptation patch ${patch.kind} has no graph Flow application; ${adaptation.adaptationId} refused.`);
  if (!patch.targetId) throw new Error("Router reroute patches must include the source node as targetId.");
  if (!graphFlow.nodes.some((node) => node.id === patch.targetId)) throw new Error(`Unknown source node for router reroute patch: ${patch.targetId}`);
  if (!graphFlow.nodes.some((node) => node.id === toNodeId)) throw new Error(`Unknown target node for router reroute patch: ${toNodeId}`);
  const edgeId = `adaptation.${safeSegment(adaptation.adaptationId)}.${safeSegment(patch.targetId)}.${safeSegment(toNodeId)}`;
  const edges = graphFlow.edges.some((edge) => edge.id === edgeId)
    ? structuredClone(graphFlow.edges)
    : [...structuredClone(graphFlow.edges), { id: edgeId, sourceNodeId: patch.targetId, sourcePortId: "failed", targetNodeId: toNodeId, targetPortId: "in", metadata: { adaptationId: adaptation.adaptationId } }];
  return { ...graphFlow, edges, updatedAt: now };
}
