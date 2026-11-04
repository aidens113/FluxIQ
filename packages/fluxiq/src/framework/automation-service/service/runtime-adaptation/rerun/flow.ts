// The Flow as it now stands, for a re-run of it, and why a re-run may not happen:
// what the re-run itself reads, and what the check before a repair's build reads
// (`./preflight.ts`), so the two cannot come to read different graphs.

import type { AutomationStudioFlowArtifact, AutomationStudioFlowSubflow, AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";

/**
 * Why a re-run did not happen. Each one is carried out to the run as its
 * `declinedCode`, because a re-run that did not happen and a repair that had
 * nothing to re-run are different facts: this used to answer `null` for every one
 * of them, and a storage failure then read as "there was nothing to do".
 */
export const AUTOMATION_STUDIO_REPAIR_RERUN_DECLINED = {
  flow: "repair_rerun.flow_unreadable",
  subflow: "repair_rerun.subflow_unreadable",
  subflowAbsent: "repair_rerun.subflow_absent",
  graph: "repair_rerun.subflow_graph_unreadable",
  nothingToRerun: "repair_rerun.nothing_to_rerun",
  lastingAct: "repair_rerun.lasting_act_may_have_landed",
  candidate: "repair_rerun.candidate_unreadable",
  candidateUnwritable: "repair_rerun.candidate_unwritable",
  heldReauthor: "repair_rerun.held_reauthor_unreadable"
} as const;

/** The reads the Flow as it stands is found through. */
export type AutomationStudioRepairFlowReads = {
  getFlowSubflow(projectId: string, flowId: string, subflowId: string): Promise<AutomationStudioFlowSubflow | null>;
  getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact>;
};

/** The Flow as it now stands: the Subflow's graph where one ran, else the Flow itself. */
export async function automationStudioRepairChangedFlow(input: {
  ports: AutomationStudioRepairFlowReads;
  projectId: string;
  session: Pick<AutomationStudioRuntimeSession, "flowId">;
  subflowId?: string | undefined;
}): Promise<{ flow: AutomationStudioFlowArtifact } | { declinedCode: string }> {
  if (!input.subflowId) {
    try {
      return { flow: await input.ports.getFlow(input.projectId, input.session.flowId) };
    } catch {
      return { declinedCode: AUTOMATION_STUDIO_REPAIR_RERUN_DECLINED.flow };
    }
  }
  let selectedSubflow: AutomationStudioFlowSubflow | null;
  try {
    selectedSubflow = await input.ports.getFlowSubflow(input.projectId, input.session.flowId, input.subflowId);
  } catch {
    return { declinedCode: AUTOMATION_STUDIO_REPAIR_RERUN_DECLINED.subflow };
  }
  if (!selectedSubflow?.graphFlowId) return { declinedCode: AUTOMATION_STUDIO_REPAIR_RERUN_DECLINED.subflowAbsent };
  let updatedFlow: AutomationStudioFlowArtifact;
  try {
    updatedFlow = await input.ports.getFlow(input.projectId, selectedSubflow.graphFlowId);
  } catch {
    return { declinedCode: AUTOMATION_STUDIO_REPAIR_RERUN_DECLINED.graph };
  }
  // Ownership is never declined: a graph this parent does not own is a fault,
  // not an absence, and running it would run somebody else's Flow.
  if (updatedFlow.metadata?.parentFlowId !== input.session.flowId
    || updatedFlow.metadata?.parentSubflowId !== input.subflowId) {
    throw new Error("Adaptive retry Subflow graph ownership no longer matches the selected parent and Subflow.");
  }
  return { flow: updatedFlow };
}
