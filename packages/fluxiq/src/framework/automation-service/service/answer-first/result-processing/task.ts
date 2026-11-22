import type { AutomationStudioFlowTaskProcessing } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstProcessingSource, type AutomationStudioAnswerFirstProcessingDeclaration } from "./declaration.ts";

/** A kept task declares once. Only a provably saved task with no new interpretation may retain legacy absence. */
export function automationStudioAnswerFirstTaskProcessing(input: {
  instructionText: string;
  declared: AutomationStudioFlowTaskProcessing | undefined;
  kept: AutomationStudioAnswerFirstProcessingDeclaration | undefined;
  legacy: boolean;
}): AutomationStudioAnswerFirstProcessingDeclaration | undefined {
  if (input.kept !== undefined) return structuredClone(input.kept);
  if (input.legacy && input.declared === undefined) return undefined;
  return { version: 1, source: automationStudioAnswerFirstProcessingSource(input.instructionText), revision: 1, task: input.declared === undefined ? {} : structuredClone(input.declared) };
}
