// A stored Flow's outline: the graph it is given, with the Flow's interface and router and the names and
// lasting classes of the Flows its steps run, read from the service.
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import type { ExecutableGraph } from "../../../../flows/executable/graph/index.ts";
import { outlineCallLinkOf } from "../../../../flows/executable/outline/graph/index.ts";
import { outlineFlow, type FlowOutline, type OutlineCallee, type OutlineLink } from "../../../../flows/executable/outline/index.ts";

const keyOf = (link: OutlineLink): string => `${link.kind}:${link.id}`;

/** What is known of one Flow a step runs, or nothing when it is gone. */
async function calleeOf(service: AutomationStudioService, projectId: string, flowId: string, link: OutlineLink): Promise<OutlineCallee | undefined> {
  if (link.kind === "fluxnode") return { name: link.id };
  if (link.kind === "flow") return { name: (await service.getFlow(projectId, link.id)).name };
  if (link.kind === "subflow") {
    const page = await service.listFlowSubflowSummaries({ projectId, flowId, limit: 100 });
    const found = page.subflows.find((subflow) => subflow.subflowId === link.id);
    return found ? { name: found.name } : undefined;
  }
  const part = await service.projectParts.get({ projectId, partId: link.id });
  return "card" in part ? { name: part.card.name, lastingClasses: part.card.lastingClasses } : undefined;
}

/** What is known of each Flow `links` name; one that cannot be read is left out, and its step is worded without a name. */
async function calleesOf(service: AutomationStudioService, projectId: string, flowId: string, links: readonly OutlineLink[]): Promise<Map<string, OutlineCallee>> {
  const callees = new Map<string, OutlineCallee>();
  for (const link of links) {
    if (callees.has(keyOf(link))) continue;
    try {
      const callee = await calleeOf(service, projectId, flowId, link);
      if (callee) callees.set(keyOf(link), callee);
    } catch { /* best-effort: a step that runs a Flow nobody can read now still shows in the list, without the name */ }
  }
  return callees;
}

/** The outline of `graph`, which is `flowId`'s graph at some version. */
export async function outlineOfStoredFlow(service: AutomationStudioService, projectId: string, flowId: string, graph: Pick<ExecutableGraph, "nodes" | "edges">): Promise<FlowOutline> {
  const flow = await service.getFlow(projectId, flowId);
  const router = await service.getFlowRouter(projectId, flowId);
  const links: OutlineLink[] = [];
  for (const node of graph.nodes) {
    const link = outlineCallLinkOf(node);
    if (link) links.push(link);
  }
  for (const rule of router?.rules ?? []) links.push({ kind: "subflow", id: rule.target.subflowId });
  if (router?.fallback?.kind === "subflow") links.push({ kind: "subflow", id: router.fallback.subflowId });
  const callees = await calleesOf(service, projectId, flowId, links);
  return outlineFlow(graph, { interface: flow.interface, ...(router ? { router } : {}), describeFlow: (link) => callees.get(keyOf(link)) });
}
