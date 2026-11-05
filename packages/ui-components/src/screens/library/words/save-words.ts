import type { SubflowRefusal, SubflowSaveOutcome } from "../types.ts";

/** What a person is told after pressing Save this. A refusal is Core's own sentence, never a code. */
export function saveWords(outcome: SubflowSaveOutcome | SubflowRefusal): string {
  if ("refused" in outcome || !outcome.saved) return outcome.message;
  if (outcome.status === "new_version") return "Saved as a newer version. Find it in your Library.";
  if (outcome.status === "existing") return "This is already in your Library. Nothing changed.";
  return "Saved. Find it in your Library.";
}
