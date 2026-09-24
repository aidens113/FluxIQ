// What an `extend` build starts from: the Flow as it stands, and the ids it
// must keep.
//
// A creation starts from nothing, so it needs nothing read. An extend starts
// from the Flow the run just executed, and two things have to be read off it
// before the loop is asked anything: the steps it already contains, as the
// draft the model will amend (`runtime/llm/node-tools/draft-from-flow.ts`), and
// the ids the edit must preserve (`flow-bootstrap/extend.ts`).
//
// It lives beside the generation request rather than in `runtime/service.ts`
// for the reason the request reader does: it is a cohesive read with one
// answer, and the service is left with the build.

import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioBootstrapExistingTopology } from "../../flow-bootstrap/index.ts";
import { automationStudioBootstrapExtendSubflow } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowDraftFlowSeed } from "../../llm/index.ts";
import { automationStudioFlowDraftSeedFromFlow } from "../../llm/index.ts";

/** What the build is handed, and what apply will need to reach the same topology. */
export type AutomationStudioFlowBootstrapExtendSubject = {
  seed: AutomationStudioFlowDraftFlowSeed;
  existing: AutomationStudioBootstrapExistingTopology;
};

/**
 * The Flow read back as a draft, with the Router, Subflow and graph Flow ids an
 * edit keeps, or nothing when this Flow cannot be extended in place.
 *
 * Nothing is the honest answer for a Flow whose Subflows do not say which one
 * the build would be editing: reusing the wrong one's id would overwrite a
 * Subflow the person never asked about. The caller refuses rather than
 * extending without the ids, because an extend that keeps none of them is a
 * replacement wearing the word.
 */
export async function automationStudioFlowBootstrapExtendSubject(input: {
  projectId: string;
  flowId: string;
  listSubflows(): Promise<readonly { subflowId: string; graphFlowId?: string; role?: string; status?: string }[]>;
  getFlowRouter(): Promise<{ routerId: string } | null | undefined>;
  getGraphFlow(graphFlowId: string): Promise<{ nodes: readonly AutomationStudioFlowNode[]; edges: readonly AutomationStudioFlowEdge[] }>;
}): Promise<AutomationStudioFlowBootstrapExtendSubject | undefined> {
  const subflow = automationStudioBootstrapExtendSubflow(await input.listSubflows());
  if (!subflow) return undefined;
  const graph = await input.getGraphFlow(subflow.graphFlowId);
  const seed = automationStudioFlowDraftSeedFromFlow({ nodes: graph.nodes, edges: graph.edges });
  // A graph with no step the assembler would emit is nothing to extend: the
  // build would be starting from an empty draft, which is a creation, and
  // saying so is more useful than silently doing one under the other word.
  if (!seed.steps.length) return undefined;
  const router = await input.getFlowRouter();
  return {
    seed,
    existing: {
      ...(router?.routerId ? { routerId: router.routerId } : {}),
      subflowId: subflow.subflowId,
      graphFlowId: subflow.graphFlowId
    }
  };
}
