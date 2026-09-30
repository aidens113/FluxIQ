import { flowModelBinding, isEmptyOrchestrationParent, type FlowModelBinding } from "./flow-model-binding";

/**
 * The longest the browser waits for a website exploration's answer. An
 * exploration iterates until it has a proposal, stops making progress, or
 * reaches the Flow's spending limit, all decided by Core; this only keeps the
 * request from being abandoned before Core answers.
 */
export const WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS = 675_000;

export const AUTOMATION_LLM_PROGRESS_LABELS = Object.freeze({
  checkingPriorEvidence: "Checking prior evidence",
  inspectingLiveTarget: "Inspecting live target",
  generatingProposal: "Generating proposal",
  readyForReview: "Ready for review"
});

/** A build is one command: pressing it calls the endpoint. */
export const blankFlowAuthoringRequestPolicy = Object.freeze({
  generation: Object.freeze({ endpoint: "generate-flow-bootstrap-adaptation", intent: "mutation" })
});

export type BlankFlowAuthoringReadiness = {
  loading: boolean;
  instructions: any[];
  router: any | null;
  subflowTotal: number;
  error: string;
};

function blankFlowRequestBase(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness, requireActiveInstruction: boolean): FlowModelBinding {
  const isBlank = isEmptyOrchestrationParent(flow) && !readiness.router && readiness.subflowTotal === 0;
  const hasActiveInstruction = readiness.instructions.some((instruction) => instruction?.status === "active");
  if (readiness.loading || readiness.error || !isBlank || (requireActiveInstruction && !hasActiveInstruction)) return { ok: false };
  return flowModelBinding(projectId, flow);
}

/**
 * The build from the Flow's active instructions. It needs an active
 * instruction and a Flow with nothing built yet.
 */
export function blankFlowAuthoringRequest(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness): { ok: true; payload: { projectId: string; flowId: string } } | { ok: false } {
  const base = blankFlowRequestBase(projectId, flow, readiness, true);
  return base.ok ? { ok: true, payload: base.payload } : { ok: false };
}

/**
 * The website exploration. It needs no active instruction beforehand: the
 * person's task is saved as one immediately before the build.
 */
export function blankFlowExplorationRequest(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness): { ok: true; payload: { projectId: string; flowId: string } } | { ok: false } {
  const base = blankFlowRequestBase(projectId, flow, readiness, false);
  return base.ok ? { ok: true, payload: base.payload } : { ok: false };
}
