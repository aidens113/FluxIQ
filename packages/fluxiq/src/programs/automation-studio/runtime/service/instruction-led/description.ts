import { AutomationInstructionError } from "./error.ts";

export function requiredRecordingDescription(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 4000) throw new AutomationInstructionError("recording.description_required");
  return value.trim();
}
