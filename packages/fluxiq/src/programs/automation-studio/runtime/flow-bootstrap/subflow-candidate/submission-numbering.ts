// A brief's refusals on its own numbering (A8 towels `run-mvac0nmw`, t658).
// A brief shown an earlier brief's revision -- a repair's, or a proposal an
// amendment carried -- numbers its own revisions on from it
// (`./scoped-submission.ts`, `revisionsAfter`), while the candidate controller
// it wraps numbers from 1 and is not this module's. So every revision a
// refusal of that controller names goes out moved on by the same offset: the
// refusal's own revision, the revisions its feedback names as fields
// (`revision`, `standingRevision.revision`, each kept condition's
// `revision`), and each "revision N" in its instruction and its issues'
// messages -- the words of `../candidate/unchanged-submission.ts` and the kept
// condition's. What a trial or a judge said (`lastTrial`, `judged`) is left as
// it is: it already speaks of this brief's revisions.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowCandidateSubmission } from "../candidate/index.ts";

/**
 * The candidate controller's refusal on this brief's numbering (header, t658):
 * its revision, the revisions its feedback names as fields (`revision`,
 * `standingRevision.revision`, each kept condition's `revision`), and each
 * "revision N" in its instruction and its issues' messages, all moved on by
 * `offset`. What a trial or judge said is left as it is.
 */
export function automationStudioSubflowRenumberedRefusal(submitted: Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>, offset: number): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }> {
  if (!offset) return submitted;
  const feedback = submitted.check.feedback;
  return { ...submitted, revision: submitted.revision + offset, check: { ...submitted.check, ...(feedback ? { feedback: renumberedFeedback(feedback, offset) } : {}) } };
}

/** A refusal's feedback with the revisions it names moved on by `offset` (`automationStudioSubflowRenumberedRefusal`). */
function renumberedFeedback(feedback: JsonObject, offset: number): JsonObject {
  const moved = (value: JsonValue | undefined): JsonValue | undefined => (typeof value === "number" ? value + offset : value);
  const said = (value: JsonValue | undefined): JsonValue | undefined => (typeof value === "string" ? value.replace(/\b([Rr]evision) (\d+)\b/gu, (_whole, word: string, number: string) => `${word} ${Number(number) + offset}`) : value);
  const out: JsonObject = structuredClone(feedback);
  if (out.revision !== undefined) out.revision = moved(out.revision)!;
  if (isObject(out.standingRevision) && out.standingRevision.revision !== undefined) out.standingRevision = { ...out.standingRevision, revision: moved(out.standingRevision.revision)! };
  if (Array.isArray(out.keptConditions)) out.keptConditions = out.keptConditions.map((entry) => (isObject(entry) && entry.revision !== undefined ? { ...entry, revision: moved(entry.revision)! } : entry));
  if (out.instruction !== undefined) out.instruction = said(out.instruction)!;
  if (Array.isArray(out.issues)) out.issues = out.issues.map((entry) => (isObject(entry) && entry.message !== undefined ? { ...entry, message: said(entry.message)! } : entry));
  return out;
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
