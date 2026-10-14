import type { AutomationStudioFlowArtifact, AutomationStudioInstructionScope } from "../../../model/index.ts";

// Every owner an instruction scope names must exist in the Flow it names
// before the instruction is saved (t571). The accepted-state contract already
// refuses an instruction whose node is not a node of its Flow
// (`instruction_node_missing`), whose Router or Subflow is another Flow's or
// none (`instruction_owner_missing`); a save that admitted one wrote the JSON
// detail and the summary index and then lost the project SQL row, so the two
// listings disagreed. Refusing here keeps one answer in every store.
//
// A node belongs to the Flow when the Flow's own document holds it or, since a
// Flow's steps live in its Subflows' graphs, when the named Subflow's graph
// does (any of the Flow's Subflow graphs when the scope names no Subflow). The
// documents are the reference: the SQL graph tables are imported lazily, so
// they can lack a node of a real Flow.

export type InstructionScopeOwnerLookup = {
  /** The Flow's document; throws for a Flow the project does not have. */
  flow(flowId: string): Promise<AutomationStudioFlowArtifact>;
  router(flowId: string): Promise<{ routerId: string } | null>;
  subflow(flowId: string, subflowId: string): Promise<{ graphFlowId?: string } | null>;
  /** One page of the Subflows the Flow owns. */
  subflowPage(flowId: string, page: { limit: number; offset: number }): Promise<{ subflows: Array<{ graphFlowId?: string }>; total: number }>;
};

const SUBFLOW_PAGE = 100;

async function subflowGraphFlowIds(flowId: string, lookup: InstructionScopeOwnerLookup): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += SUBFLOW_PAGE) {
    const page = await lookup.subflowPage(flowId, { limit: SUBFLOW_PAGE, offset });
    ids.push(...page.subflows.flatMap((item) => item.graphFlowId ? [item.graphFlowId] : []));
    if (!page.subflows.length || offset + SUBFLOW_PAGE >= page.total) return ids;
  }
}

export async function assertInstructionScopeOwners(scope: AutomationStudioInstructionScope, lookup: InstructionScopeOwnerLookup): Promise<void> {
  if (!("flowId" in scope)) return;
  const flow = await lookup.flow(scope.flowId);
  if (scope.kind === "router" && (await lookup.router(scope.flowId))?.routerId !== scope.routerId) {
    throw new Error(`Instruction scope names Router ${scope.routerId}, which is not the Router of Flow ${scope.flowId}.`);
  }
  const subflowId = "subflowId" in scope ? scope.subflowId : undefined;
  const subflow = subflowId ? await lookup.subflow(scope.flowId, subflowId) : null;
  if (subflowId && !subflow) throw new Error(`Instruction scope names Subflow ${subflowId}, which is not a Subflow of Flow ${scope.flowId}.`);
  const nodeId = "nodeId" in scope ? scope.nodeId : undefined;
  if (!nodeId || flow.nodes.some((node) => node.id === nodeId)) return;
  const graphFlowIds = subflow ? (subflow.graphFlowId ? [subflow.graphFlowId] : []) : await subflowGraphFlowIds(scope.flowId, lookup);
  for (const graphFlowId of graphFlowIds) {
    if ((await lookup.flow(graphFlowId)).nodes.some((node) => node.id === nodeId)) return;
  }
  throw new Error(`Instruction scope names node ${nodeId}, which is not a node of ${subflowId ? `Subflow ${subflowId} of ` : ""}Flow ${scope.flowId}.`);
}
