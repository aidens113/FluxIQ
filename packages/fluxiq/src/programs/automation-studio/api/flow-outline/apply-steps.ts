// Saves a list of graph operations as a new version of a Flow, and answers in the outline's terms: the new
// version and its outline, the undo edits, or, when the Flow changed under the editor, who changed it and
// which steps.
import { randomUUID } from "node:crypto";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import { outlineFlatSteps, type FlowOutline } from "../../../../flows/executable/outline/index.ts";
import { outlineOfStoredFlow } from "./outline-of.ts";

/** The store's graph edits. */
export type Operations = Parameters<AutomationStudioService["flowGraphPatch"]["applyFlowGraphPatch"]>[0]["operations"];

const SOURCE = { person: "editor_patch", assistant: "assistant_patch" } as const;

/** One saved version that changed the Flow since the editor last read it. */
export type OutlineChange = { revisionNumber: number; madeBy: string; madeByLabel: string; message: string; createdAt: number };

export type OutlineConflict = {
  status: "conflict";
  flowId: string;
  baseRevision: number;
  currentRevision: number;
  conflictingEntityIds: string[];
  /** The versions saved since, newest first, each with who made it. */
  changedBy: OutlineChange[];
  /** The numbers of the steps, in the Flow as it is now, that hold what changed. */
  steps: string[];
};

export type AppliedSteps =
  | { ok: true; revision: number; inverseOperations: Operations; outline: FlowOutline }
  | { ok: false; conflict: OutlineConflict; outline: FlowOutline; revision: number };

/** The versions saved after `baseRevision`, with who made each. */
export async function changesSince(service: AutomationStudioService, projectId: string, flowId: string, baseRevision: number, currentRevision: number): Promise<OutlineChange[]> {
  const history = await service.flowGraphPatch.listFlowGraphRevisions({ projectId, flowId, limit: Math.max(1, currentRevision - baseRevision) });
  return history.revisions.filter((entry) => entry.revisionNumber > baseRevision).map(({ revisionNumber, madeBy, madeByLabel, message, createdAt }) => ({ revisionNumber, madeBy, madeByLabel, message, createdAt }));
}

/** The answer for an edit made on a version the Flow has moved past. */
export async function conflictAnswer(service: AutomationStudioService, input: { projectId: string; flowId: string; baseRevision: number; currentRevision: number; conflictingEntityIds: string[] }): Promise<AppliedSteps & { ok: false }> {
  const { projectId, flowId } = input;
  const now = await service.flowGraphPatch.readFlowGraph({ projectId, flowId });
  const outline = await outlineOfStoredFlow(service, projectId, flowId, now.graph!);
  const conflicting = new Set(input.conflictingEntityIds);
  const steps = outlineFlatSteps(outline.steps).filter((step) => step.number && step.nodeIds.some((id) => conflicting.has(id))).map((step) => step.number);
  const changedBy = await changesSince(service, projectId, flowId, input.baseRevision, input.currentRevision);
  return { ok: false, conflict: { status: "conflict", flowId, baseRevision: input.baseRevision, currentRevision: input.currentRevision, conflictingEntityIds: input.conflictingEntityIds, changedBy, steps }, outline, revision: input.currentRevision };
}

/** Applies `operations` on top of `baseRevision` under a fresh mutation id. */
export async function applyOutlineOperations(service: AutomationStudioService, input: { projectId: string; flowId: string; baseRevision: number; operations: Operations; message: string; madeBy: "person" | "assistant" }): Promise<AppliedSteps> {
  const { projectId, flowId } = input;
  const applied = await service.flowGraphPatch.applyFlowGraphPatch({ projectId, flowId, baseRevision: input.baseRevision, mutationId: `outline.${randomUUID()}`, operations: input.operations, source: SOURCE[input.madeBy], message: input.message });
  const { result } = applied;
  if (result.status === "applied") {
    const flow = applied.flow ?? (await service.getFlow(projectId, flowId));
    return { ok: true, revision: result.revisionNumber, inverseOperations: result.inverseOperations, outline: await outlineOfStoredFlow(service, projectId, flowId, flow) };
  }
  return conflictAnswer(service, { projectId, flowId, baseRevision: result.baseRevision, currentRevision: result.currentRevision, conflictingEntityIds: result.conflictingEntityIds });
}
