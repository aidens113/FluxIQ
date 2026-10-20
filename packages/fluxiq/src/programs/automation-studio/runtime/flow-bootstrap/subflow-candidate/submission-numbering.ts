// A brief's refusals on its own numbering (A8 towels `run-mvac0nmw`, t658).
// A brief shown an earlier brief's revision -- a repair's, or a proposal an
// amendment carried -- numbers its own revisions on from it
// (`./scoped-submission.ts`, `revisionsAfter`), while the candidate controller
// it wraps numbers from 1 and is not this module's. So every revision a
// refusal of that controller names goes out on this brief's numbering: the
// refusal's own revision, the revisions its feedback names as fields
// (`revision`, `standingRevision.revision`, each kept condition's and kept
// step's `revision`), and each "revision N" in its instruction and its issues'
// messages -- the words of `../candidate/unchanged-submission.ts` and the kept
// condition's. What a trial or a judge said (`lastTrial`, `judged`) is left as
// it is: it already speaks of this brief's revisions.
//
// **And every digest it names is the proposal's (t741).** On the photo rerun
// (`run-mvgobp8h-b99ede98`, 0371-0385) the refusal's revisions were moved on
// by the brief's offset but its digests were the probe candidate's, which no
// receipt of this brief carries, and a plan the controller accepted again after
// another was a new revision there ("revision 14") while the brief answered it
// with its own (12). The model tested exactly what the refusal named and was
// refused stale twice. So a refusal is read through the brief's own map
// (`numbering`): each revision the controller accepted reads as the revision
// of the proposal it is, any other (a refused submission's own) moved on by
// the offset; each digest, in a field or in the words, reads as its
// proposal's.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowCandidateSubmission } from "../candidate/index.ts";

type Refusal = Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>;

/** How the candidate controller's revisions and digests read on this brief's numbering (header). */
type Numbering = { revision: (inner: number) => number; digest: (inner: string) => string };

/**
 * The candidate controller's refusal on this brief's numbering (header, t658,
 * t741): its revision, the revisions and digests its feedback names as fields
 * (`revision`/`digest`, `standingRevision`, each kept condition's and kept
 * step's `revision`), and each "revision N" and digest in its instruction and
 * its issues' messages, each read through `numbering`. What a trial or judge
 * said is left as it is.
 */
export function automationStudioSubflowRenumberedRefusal(submitted: Refusal, numbering: Numbering): Refusal {
  const feedback = submitted.check.feedback;
  return { ...submitted, revision: numbering.revision(submitted.revision), check: { ...submitted.check, ...(feedback ? { feedback: renumberedFeedback(feedback, numbering) } : {}) } };
}

/** A refusal's feedback with the revisions and digests it names read through `numbering` (`automationStudioSubflowRenumberedRefusal`). */
function renumberedFeedback(feedback: JsonObject, numbering: Numbering): JsonObject {
  const moved = (value: JsonValue | undefined): JsonValue | undefined => (typeof value === "number" ? numbering.revision(value) : value);
  const digest = (value: JsonValue | undefined): JsonValue | undefined => (typeof value === "string" ? numbering.digest(value) : value);
  const said = (value: JsonValue | undefined): JsonValue | undefined => (typeof value === "string"
    ? value
      .replace(/\b([Rr]evision) (\d+)\b/gu, (_whole, word: string, number: string) => `${word} ${numbering.revision(Number(number))}`)
      .replace(/\b[0-9a-f]{64}\b/gu, (found) => numbering.digest(found))
    : value);
  const out: JsonObject = structuredClone(feedback);
  if (out.revision !== undefined) out.revision = moved(out.revision)!;
  if (out.digest !== undefined) out.digest = digest(out.digest)!;
  const standing = out.standingRevision;
  if (isObject(standing)) out.standingRevision = { ...standing, ...(standing.revision !== undefined ? { revision: moved(standing.revision)! } : {}), ...(standing.digest !== undefined ? { digest: digest(standing.digest)! } : {}) };
  for (const list of ["keptConditions", "keptSteps"] as const) {
    const entries = out[list];
    if (Array.isArray(entries)) out[list] = entries.map((entry) => (isObject(entry) && entry.revision !== undefined ? { ...entry, revision: moved(entry.revision)! } : entry));
  }
  if (out.instruction !== undefined) out.instruction = said(out.instruction)!;
  if (Array.isArray(out.issues)) out.issues = out.issues.map((entry) => (isObject(entry) && entry.message !== undefined ? { ...entry, message: said(entry.message)! } : entry));
  return out;
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
