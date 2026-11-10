import type { StepEdit } from "../wire";

/** Which Flow, at which version: every change is made against the version the list showed. */
export type FlowAt = { projectId: string; flowId: string; revision: number };

/** `edit-flow-steps`' payload for one change made on the list. */
export function stepEditPayload(at: FlowAt, edit: StepEdit): Record<string, unknown> {
  return { projectId: at.projectId, flowId: at.flowId, baseRevision: at.revision, edit };
}
