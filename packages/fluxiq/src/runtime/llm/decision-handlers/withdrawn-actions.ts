// The actions a narrowed input property says are withdrawn, and the note that says so (t1034).
//
// Looks withdrawn (`./look-withdrawal.ts`) narrow the node runner's list of actions and write this note beside the
// shorter list, naming what was left out: the only place a decision schema keeps them, since a provider adapter refuses
// a key it does not know. The Anthropic adapter holds a decision to its schema before the loop sees it, and reads the
// note back so a withdrawn look named anyway is the loop's to refuse by name (`../anthropic/decision-check.ts`). Writer
// and reader share this one sentence, and this module imports nothing, so the adapter can read it without importing the
// loop.

/** Said beside a narrowed action list, before the withdrawn names (`./look-withdrawal.ts`, t1025). */
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
