// The actions a narrowed input property says are withdrawn, and the note that says so (t1034).
//
// Retired with looks (page-diff D4 and D11, t1036): looks are never withdrawn, so no node list is narrowed and this note
// is never written. It stays only because the Anthropic adapter still reads it back
// (`../anthropic/decision-check.ts`), and goes with that reader. Writer and reader shared this one sentence, and this
// module imports nothing.
/** Said beside a narrowed action list, before the withdrawn names (t1025). */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_NARROWED_NOTE = "Not offered now, because each only looked and looks are withdrawn until an action runs:";

/** The actions an input property's note says are withdrawn (header); none where it carries no such note. */
export function automationStudioLlmEvidenceWithdrawnActions(property: unknown): string[] {
  if (!property || typeof property !== "object" || Array.isArray(property)) return [];
  const description = (property as { description?: unknown }).description;
  if (typeof description !== "string") return [];
  const at = description.lastIndexOf(`${AUTOMATION_STUDIO_LLM_EVIDENCE_NARROWED_NOTE} `);
  if (at < 0 || !description.endsWith(".")) return [];
  return description.slice(at + AUTOMATION_STUDIO_LLM_EVIDENCE_NARROWED_NOTE.length + 1, -1).split(", ").filter((name) => name.length > 0);
}
