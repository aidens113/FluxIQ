import { createHash } from "node:crypto";
import { readAutomationStudioFlowTaskProcessing, type AutomationStudioFlowTaskProcessing } from "../../../../../runtime/flow-authoring/draft/index.ts";

/** Framework execution metadata before capture supplies real fields. Undefined belongs only to saved legacy tasks. */
export type AutomationStudioAnswerFirstProcessingDeclaration = {
  version: 1;
  source: string;
  revision: number;
  task: AutomationStudioFlowTaskProcessing;
};

/** This digest identifies the actual instruction used by the attempt, never a model's claimed provenance. */
export function automationStudioAnswerFirstProcessingSource(instructionText: string): string {
  return createHash("sha256").update(instructionText).digest("hex");
}

/** Strictly read persisted execution metadata; an unreadable automatic declaration cannot become a legacy task. */
export function readAutomationStudioAnswerFirstProcessingDeclaration(value: unknown): AutomationStudioAnswerFirstProcessingDeclaration | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4 || !["version", "source", "revision", "task"].every((key) => Object.hasOwn(record, key))) return undefined;
  if (record.version !== 1 || typeof record.source !== "string" || !/^[a-f0-9]{64}$/u.test(record.source) || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1) return undefined;
  const task = readAutomationStudioFlowTaskProcessing(record.task);
  return task === undefined ? undefined : { version: 1, source: record.source, revision: record.revision as number, task };
}
