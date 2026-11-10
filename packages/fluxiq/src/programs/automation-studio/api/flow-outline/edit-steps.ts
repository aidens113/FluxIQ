// One edit made on a Flow's list of steps: re-outlined at the version the person was looking at, turned into
// operations by the outline module, and saved as a new version.
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import { outlineEdit, type OutlineEdit } from "../../../../flows/executable/outline/index.ts";
import { applyOutlineOperations, conflictAnswer, type AppliedSteps, type Operations } from "./apply-steps.ts";
import { outlineOfStoredFlow } from "./outline-of.ts";

export type EditedSteps = AppliedSteps | { ok: false; reason: string };

/** Makes `edit` against `baseRevision`; a refused edit changes nothing and is answered with its reason. */
export async function editFlowSteps(service: AutomationStudioService, input: { projectId: string; flowId: string; baseRevision: number; edit: OutlineEdit; madeBy: "person" | "assistant" }): Promise<EditedSteps> {
  const { projectId, flowId } = input;
  const at = await service.flowGraphPatch.readFlowGraph({ projectId, flowId, revision: input.baseRevision });
  if (input.baseRevision > at.currentRevision) return { ok: false, reason: "That version of this Flow does not exist. Reload the Flow and try again." };
  // A version that was not kept has no step numbers to edit by: the Flow has moved past it, so this is a conflict.
  if (!at.graph) return conflictAnswer(service, { projectId, flowId, baseRevision: input.baseRevision, currentRevision: at.currentRevision, conflictingEntityIds: [] });
  const flow = await service.getFlow(projectId, flowId);
  const outline = await outlineOfStoredFlow(service, projectId, flowId, at.graph);
  const edit = outlineEdit(outline, { ...at.graph, interface: flow.interface }, input.edit);
  if (!edit.ok) return { ok: false, reason: edit.reason };
  return applyOutlineOperations(service, { projectId, flowId, baseRevision: input.baseRevision, operations: edit.operations as Operations, message: edit.message, madeBy: input.madeBy });
}
