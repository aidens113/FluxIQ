// The words a Flow's goal holds now, read as an attempt reads them (`../attempt/task-words.ts`): what a
// press of Run again checks is still this task's before it starts one.

import type { AutomationStudioFlowInstruction } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioAnswerFirstTaskWords } from "../attempt/task-words.ts";

export async function automationStudioAnswerFirstGoalWords(service: { getFlowInstructionSet(input: { projectId: string; flowId: string }): Promise<AutomationStudioFlowInstruction[]> }, projectId: string, flowId: string): Promise<string | undefined> {
  const held = await service.getFlowInstructionSet({ projectId, flowId });
  const active = held.filter((instruction) => instruction.status === "active").map((instruction) => ({ scopeKind: instruction.scope.kind, tags: instruction.tags, body: instruction.body }));
  return automationStudioAnswerFirstTaskWords({ instructionText: "", activeInstructions: active }) || undefined;
}
