// Whether normal deterministic execution may continue after one change, and
// from where. This is a different question from what the trial proved
// (`verdict.ts`), and it is answered from the checks themselves rather than
// from the proof outcome, so neither answer can quietly stand in for the other.
//
// Every rule here fails closed, because the cost of the two mistakes is not
// symmetric: refusing to continue a run that could have continued costs one
// recovery pass, while continuing a run whose evidence nobody looked at is the
// defect this whole phase exists to close.
//
// - A check that is `unknown` ends it. The trial made that check because
//   something declared it, and "could not tell" is not "held".
// - A check that passed only because the seam feeding it is inert is read as
//   unknown, not as a pass. `records` with no declared minimum is the one such
//   seam today: rows were captured, but nothing said how many were owed.
// - Success alone is never enough. A changed node that ran without failing has
//   shown nothing, so at least one evidence check must have passed.
// - No resume point, no resumption: a run cannot continue from a place the
//   trial could not name.
import { AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS, type AutomationStudioChangeResumeDecision, type AutomationStudioChangeResumePoint, type AutomationStudioChangeVerdictCheck, type AutomationStudioChangeVerdictCheckStatus } from "./contracts.ts";

/**
 * Check codes whose `passed` is not a pass for resuming: the check reads a seam
 * nothing writes yet, so what it looked at cannot answer the question asked of
 * it. Each is read as `unknown`, which is never a pass.
 */
const INERT_CHECK_CODES: readonly string[] = Object.freeze(["records_minimum_undeclared"]);

export function decideAutomationStudioChangeResume(input: {
  checks: readonly AutomationStudioChangeVerdictCheck[];
  resumeFrom?: AutomationStudioChangeResumePoint;
}): AutomationStudioChangeResumeDecision {
  const { checks, resumeFrom } = input;
  if (!checks.length) return { resumable: false, code: "no_checks" };
  if (checks.some((check) => resumeStatus(check) === "failed")) return { resumable: false, code: "check_failed" };
  if (checks.some((check) => resumeStatus(check) === "unknown")) return { resumable: false, code: "check_unknown" };
  if (!resumeFrom) return { resumable: false, code: "no_resume_point" };
  const evidence = checks.some((check) => isEvidenceKind(check.kind) && resumeStatus(check) === "passed");
  if (!evidence) return { resumable: false, code: "no_evidence" };
  return { resumable: true };
}

// A check's status as the resume decision reads it: its own, except that a pass
// resting on an inert seam is unknown.
function resumeStatus(check: AutomationStudioChangeVerdictCheck): AutomationStudioChangeVerdictCheckStatus {
  return check.status === "passed" && check.code !== undefined && INERT_CHECK_CODES.includes(check.code) ? "unknown" : check.status;
}

function isEvidenceKind(kind: AutomationStudioChangeVerdictCheck["kind"]): boolean {
  return AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS.some((evidenceKind) => evidenceKind === kind);
}
