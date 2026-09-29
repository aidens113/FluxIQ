import type { ProgramCommandTransport } from "../data/program-transport";
import type { ApiResponse } from "../../programs/program-api";
import type { ChangeDiffCurrentSubflow, ChangeDiffStep, ChangeDiffTopology } from "./change-diff";
export function listFlowAdaptations(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ adaptations?: any[]; page?: { adaptations?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-adaptations", payload); }
export function getFlowAdaptation(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ adaptation?: any }>("get-flow-adaptation", payload); }

const WHOLE_GRAPH_BOUNDS = { minX: -1_000_000_000, minY: -1_000_000_000, maxX: 1_000_000_000, maxY: 1_000_000_000 };
const GRAPH_PAGE_LIMIT = 500;
const GRAPH_MAX_PAGES = 10;

type GraphViewportPage = { nodes?: any[]; edges?: any[]; boundaryEdges?: any[]; hasMore?: boolean; nextCursor?: string | null };

/**
 * Every node and the distinct edge count of one graph Flow, read through the
 * bounded viewport endpoint (the browser may not read a full Flow document).
 * `undefined` when a page fails or the graph is larger than the pages allowed:
 * a partial list would read as removed steps.
 */
async function readGraphSteps(api: ProgramCommandTransport, projectId: string, graphFlowId: string): Promise<{ nodes: ChangeDiffStep[]; edgeCount: number } | undefined> {
  const nodes: ChangeDiffStep[] = [];
  const edgeIds = new Set<string>();
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < GRAPH_MAX_PAGES; pageIndex += 1) {
    const result: ApiResponse<{ page?: GraphViewportPage }> = await api.post<{ page?: GraphViewportPage }>("get-graph-viewport", { projectId, flowId: graphFlowId, bounds: WHOLE_GRAPH_BOUNDS, limit: GRAPH_PAGE_LIMIT, cursor });
    const page = result.ok ? result.payload?.page : undefined;
    if (!page || !Array.isArray(page.nodes)) return undefined;
    for (const node of page.nodes) {
      if (typeof node?.nodeId !== "string") continue;
      nodes.push({
        nodeId: node.nodeId,
        ...(typeof node.label === "string" && node.label ? { label: node.label } : {}),
        ...(typeof node.definitionId === "string" && node.definitionId ? { type: node.definitionId } : {})
      });
    }
    for (const edge of [...(page.edges ?? []), ...(page.boundaryEdges ?? [])]) if (typeof edge?.edgeId === "string") edgeIds.add(edge.edgeId);
    if (!page.hasMore || !page.nextCursor) return { nodes, edgeCount: edgeIds.size };
    cursor = page.nextCursor;
  }
  return undefined;
}

/**
 * The Flow's Router, its Subflows, and each Subflow's graph Flow as it stands
 * now, for the before side of a Flow Bootstrap diff. A failed Router or Subflow
 * read fails the whole load; a graph Flow that cannot be read leaves that
 * Subflow's counts and nodes absent rather than empty. `subflowIds` limits the
 * graph reads to the Subflows the adaptation touches.
 */
export async function loadFlowChangeTopology(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; subflowIds?: string[] }): Promise<ApiResponse<{ topology: ChangeDiffTopology }>> {
  const { projectId, flowId } = payload;
  const [routerResult, subflowResult] = await Promise.all([
    api.post<{ router?: { routerId?: string; ruleCount?: number } | null }>("get-flow-router-summary", { projectId, flowId }),
    api.post<{ subflows?: any[]; page?: { subflows?: any[] } }>("list-flow-subflows", { projectId, flowId, limit: 100, offset: 0 })
  ]);
  if (!routerResult.ok) return { ok: false, error: routerResult.error ?? "The Flow's Router could not be read." };
  if (!subflowResult.ok) return { ok: false, error: subflowResult.error ?? "The Flow's Subflows could not be read." };
  const router = routerResult.payload?.router;
  const wanted = payload.subflowIds ? new Set(payload.subflowIds) : null;
  const listed = (subflowResult.payload?.subflows ?? subflowResult.payload?.page?.subflows ?? []).filter((item: any) => typeof item?.subflowId === "string");
  const subflows = await Promise.all(listed.map(async (item: any): Promise<ChangeDiffCurrentSubflow> => {
    const subflow: ChangeDiffCurrentSubflow = { subflowId: item.subflowId, name: typeof item.name === "string" && item.name ? item.name : item.subflowId };
    if (typeof item.graphFlowId !== "string" || !item.graphFlowId) return subflow;
    subflow.graphFlowId = item.graphFlowId;
    if (wanted && !wanted.has(item.subflowId)) return subflow;
    const graph = await readGraphSteps(api, projectId, item.graphFlowId);
    if (!graph) return subflow;
    subflow.nodes = graph.nodes;
    subflow.nodeCount = graph.nodes.length;
    subflow.edgeCount = graph.edgeCount;
    return subflow;
  }));
  const routerTopology = router && typeof router.routerId === "string" && typeof router.ruleCount === "number" ? { routerId: router.routerId, ruleCount: router.ruleCount } : null;
  return { ok: true, payload: { topology: { router: routerTopology, subflows } } };
}
