import { automationStudioAuthoredProcessingIssue } from "./authored.ts";

/** Only authored record-output configuration, never arbitrary captured row fields. */
export function automationStudioAuthoredProcessingAmendmentsIssue(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const issue = automationStudioAuthoredProcessingIssue(item.input) ?? automationStudioAuthoredProcessingIssue(item.settings);
    if (issue) return issue;
  }
  return undefined;
}
