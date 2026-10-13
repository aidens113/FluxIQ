import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";

/** Existing written Flow tasks remain valid; inherited policy and known inference do not supply a task. */
export function automationInstructionTasks(instructions: readonly AutomationStudioFlowInstruction[], projectId: string, flowId: string): AutomationStudioFlowInstruction[] {
  return instructions.filter(instruction => instruction.status === "active" && typeof instruction.body === "string" && instruction.body.trim().length > 0 && typeof instruction.title === "string" && instruction.title.trim().length > 0
    && instruction.scope?.kind === "flow" && instruction.scope.projectId === projectId && instruction.scope.flowId === flowId
    && !["model_suggestion", "instruction_suggestion", "recording_inference", "recording_flow_proposal", "policy_proposal", "conversation_argument"].includes(String(instruction.metadata?.source ?? ""))
    && !(instruction.metadata?.taskInstruction !== true && instruction.tags?.length && instruction.tags.every(tag => tag === "safety"))
    && Number.isFinite(instruction.priority)
    && instruction.metadata?.inferred !== true && instruction.metadata?.generatedByModel !== true);
}
