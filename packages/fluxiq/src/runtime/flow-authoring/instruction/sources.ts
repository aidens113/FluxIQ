import type { FlowInstruction, InstructionSource } from "../../../flows/authoring/index.ts";

/** Only active instructions supply the person's requested work. */
export function activeInstructionSources(instructions: readonly FlowInstruction[]): InstructionSource[] {
  return instructions.filter((instruction) => instruction.status === "active").map((instruction) => ({ sourceId: instruction.instructionId, text: instruction.body }));
}
