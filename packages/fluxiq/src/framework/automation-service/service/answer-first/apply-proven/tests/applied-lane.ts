// A lane for what a proven Flow does to the person's Flow: the lending library of
// `../../tests/library-site.ts`, plus what the tests of this folder read of the Flow.
//
// **Saving the same goal keeps the digest.** The lane under this saves its instruction anew before
// every attempt, with a new time on it, and the Flow's digest covers that. The chat's own save does
// not: "supplying the same goal must preserve the saved draft's dependency digest"
// (`../../../flow-bootstrap-commands/save-goal.ts`). So this one keeps an unchanged instruction as it
// stands, as that save does, or every attempt would read as a person having changed the Flow.
// A lending library is none of the Lab's realistic scenarios.

import type { AutomationStudioBootstrapAdaptation } from "../../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { siteLane } from "../../tests/library-site.ts";

type Lane = Awaited<ReturnType<typeof siteLane>>["lane"];

export const FLOW = "flow.loans";

export async function appliedLane(cleanups: (() => Promise<void>)[]) {
  const made = await siteLane(cleanups);
  const { service } = made.lane;
  const saveInstruction = service.saveFlowInstruction.bind(service);
  service.saveFlowInstruction = async (projectId, instruction) => {
    const held = await service.getFlowInstruction(projectId, instruction.instructionId);
    const same = held && held.body === instruction.body && JSON.stringify(held.scope) === JSON.stringify(instruction.scope);
    return same ? held : await saveInstruction(projectId, instruction);
  };
  return made;
}

/** Everything of the Flow a person can see or edit, to the byte, and its digest. */
export async function flowAsItStands(lane: Lane, flowId = FLOW): Promise<string> {
  const { service, projectId } = lane;
  const { subflows } = await service.listFlowSubflowSummaries({ projectId, flowId, limit: 50, offset: 0 });
  const graphs = await Promise.all(subflows.map(async (subflow) => subflow.graphFlowId ? await service.getFlow(projectId, subflow.graphFlowId) : null));
  return JSON.stringify({ flow: await service.getFlow(projectId, flowId), router: await service.getFlowRouter(projectId, flowId), subflows, graphs, digest: await service.getLlmExecutionDependencyDigest(projectId, flowId) });
}

export async function graphOf(lane: Lane, flowId = FLOW) {
  const { service, projectId } = lane;
  const { subflows } = await service.listFlowSubflowSummaries({ projectId, flowId, limit: 50, offset: 0 });
  const id = subflows[0]?.graphFlowId;
  return id ? await service.getFlow(projectId, id) : undefined;
}

/** The node definitions of the Flow's graph, in order: none while it is blank. */
export async function stepsInTheFlow(lane: Lane, flowId = FLOW): Promise<string[]> {
  return (await graphOf(lane, flowId))?.nodes.map((node) => node.definitionId) ?? [];
}

/** Every change ever proposed on the Flow, whatever came of it. */
export async function changesOn(lane: Lane, flowId = FLOW): Promise<AutomationStudioBootstrapAdaptation[]> {
  const { bootstrapAdaptations } = lane.service as unknown as { bootstrapAdaptations: { listFlowBootstrapAdaptations(projectId: string, flowId: string): Promise<AutomationStudioBootstrapAdaptation[]> } };
  return await bootstrapAdaptations.listFlowBootstrapAdaptations(lane.projectId, flowId);
}

/** What the task knows of the Flow. */
export async function baseOf(lane: Lane, instruction?: string, flowId = FLOW) {
  return (await lane.kept(instruction))?.flowBases?.find((base) => base.flowId === flowId);
}

/** A person's "run it", through the real run path. */
export async function personRuns(lane: Lane, flowId = FLOW) {
  return await lane.service.runRuntimeSession({ projectId: lane.projectId, flowId, adaptiveMode: "no_llm_intervention", authorizedDomainIds: ["library"] });
}
