import type { AutomationStudioResultVerdictInput } from "./types.ts";

/** The judgement's advice: what it said changed, or failing that what its reply said at all. */
export function advice(input: AutomationStudioResultVerdictInput): string | undefined {
  const changed = typeof input.diagnosis?.changed === "string" && input.diagnosis.changed.trim() ? input.diagnosis.changed : undefined;
  return changed ?? (typeof input.summaryText === "string" && input.summaryText.trim() ? input.summaryText : undefined);
}
