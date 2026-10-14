import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";

// An instruction source a task spec may quote: the person's own words under the
// id they are stored by. Only active instructions are sources; a disabled or
// archived one is not something the person is asking for now.

export type AutomationStudioProjectInstructionSource = { sourceId: string; text: string };

export function automationStudioProjectActiveInstructionSources(instructions: readonly AutomationStudioFlowInstruction[]): AutomationStudioProjectInstructionSource[] {
  return instructions.filter((instruction) => instruction.status === "active").map((instruction) => ({ sourceId: instruction.instructionId, text: instruction.body }));
}
