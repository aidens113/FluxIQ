// What the model is told when a candidate submission is refused, and how the
// loop counts the refusal (t356).
//
// Lane A round 4 (`run-muyrpbnk-fef374e7`, steps 0037-0068): twelve of sixteen
// submissions were refused `flow_bootstrap.evidence_completion_parameters_unresolved`
// for the same two handles, `t478` and `t488`, printed only on the start page
// while the script's first step opens the item page (and the popup they named
// had since been closed). Two things let that run spend its purse:
//
// - **No way out was named.** The refusal said "copy that token exactly from the
//   evidence", which the model believed it had done. So each refusal now carries
//   `next`: what the issues ask for, and, for a refused handle, how to get one
//   that works -- look at the page the step runs on and copy the handle that
//   view prints, or drop a step the Flow does not need.
// - **Nothing counted it.** A submission is a look to the loop (`effect:
//   "observe"`), and the loop's run of refusals (`../../llm/decision-handlers/refusal-run.ts`)
//   counts only refused calls that would change the page or add to the Flow,
//   so only the no-progress guard stopped it, eight refusals later. A
//   submission proposes the whole Flow, so a refused one says so
//   (`draft.proposes`) under its refusal's own code (`resultCode`): the same
//   refusal a second decision in a row is warned about, and a third ends the
//   round, as every other run of refusals of one kind does (the user's rule of
//   2026-10-06). The loop never drafts in candidate mode (`discoveryOnly`), so
//   the statement adds no step anywhere.
//
// Since t358 a submission resolves a handle from any view exploration took
// (`./submission.ts`, `handleReach: "view_history"`), so `t478` and `t488` now
// resolve. A handle still refused is one no view printed (or not on the page
// its `location` names), and the recovery says so rather than telling the model
// a handle belongs only to the page it is on.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowCandidateSubmission } from "./contracts.ts";

/** The code a refused submission is counted under when its check names no closed code of its own. */
export const AUTOMATION_STUDIO_CANDIDATE_SUBMISSION_REFUSED_CODE = "candidate.submission_refused";

/** A result code the loop accepts (`../../llm/evidence-loop-decision.ts`). */
const CLOSED_CODE = /^[a-z0-9_.:-]{1,100}$/iu;
/** Issue codes about a handle a step names. */
const HANDLE_ISSUE = /^[a-z]+\.handle\.[a-z_]+(?::|$)/u;

const GENERAL_NEXT = "Correct every listed issue in the script you sent (previous, where given), keep every other line as it is, and submit the whole candidate again. "
  + "Sending the same refused script, or one refused for the same reason, a third decision in a row ends this build.";

/** The evidence and loop statement for one refused submission. */
export function automationStudioCandidateSubmissionRefusal(submitted: Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>): {
  evidence: JsonObject;
  resultCode: string;
  draft: { proposes: true };
} {
  const feedback = submitted.check.feedback ?? {};
  const handles = refusedHandles(feedback);
  return {
    evidence: { ok: false, revision: submitted.revision, diagnostics: feedback, issueCodes: [...submitted.check.issueCodes], next: handles.length ? handleNext(handles) : GENERAL_NEXT },
    resultCode: refusalCode(feedback, submitted.check.issueCodes),
    draft: { proposes: true }
  };
}

/** The refusal's own code: what makes two refusals "the same" for the run of refusals. */
function refusalCode(feedback: JsonObject, issueCodes: readonly string[]): string {
  const named = [feedback.refusal, feedback.code, issueCodes[0]].find((code): code is string => typeof code === "string" && CLOSED_CODE.test(code));
  return named ?? AUTOMATION_STUDIO_CANDIDATE_SUBMISSION_REFUSED_CODE;
}

/** Every handle a handle issue names (`../plan/issue-feedback.ts`, `handles`), once each, as written. */
function refusedHandles(feedback: JsonObject): string[] {
  const issues: JsonValue[] = Array.isArray(feedback.issues) ? feedback.issues : [];
  const found = new Set<string>();
  for (const issue of issues) {
    if (!issue || typeof issue !== "object" || Array.isArray(issue) || typeof issue.code !== "string" || !HANDLE_ISSUE.test(issue.code)) continue;
    const handles: JsonValue[] = Array.isArray(issue.handles) ? issue.handles : [];
    for (const entry of handles) {
      if (entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.handle === "string" && CLOSED_CODE.test(entry.handle)) found.add(entry.handle);
    }
  }
  return [...found];
}

/** What to do about refused handles; it names each one, which are tokens the model itself wrote. */
function handleNext(handles: readonly string[]): string {
  const named = handles.join(", ");
  return `${handles.length === 1 ? "The handle" : "The handles"} ${named} ${handles.length === 1 ? "does" : "do"} not name one control in any view this build was shown, so copying ${handles.length === 1 ? "it" : "them"} again will be refused again. `
    + "A step may name a control from any view this build printed, on any page it visited, copied exactly as that view printed it; a handle no view printed, or written from memory, cannot be a step's target. "
    + "To act on a control on the page this step runs on, look at that page (go there, then capture it) and copy the handle that view prints for the control; "
    + "if the Flow does not need the step -- the control is not on the page when the Flow gets there -- drop it. "
    + "Then submit the whole candidate again. Sending the same refused script, or one refused for the same reason, a third decision in a row ends this build.";
}
