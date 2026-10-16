import type { AutomationStudioResultVerdictInput } from "./types.ts";

/** Everything the reply said in words: its expected, observed and changed, and its summary. Read for the rows it names, never recorded. */
export function replyText(input: AutomationStudioResultVerdictInput): string {
  const said = [input.diagnosis?.expected, input.diagnosis?.observed, input.diagnosis?.changed, input.summaryText];
  return said.filter((text): text is string => typeof text === "string" && text.trim().length > 0).join("\n");
}
