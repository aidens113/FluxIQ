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
//
// **Each refused step is named, and a run of refusals is one of the same
// issues (t378).** Lane B (`run-mv0fu9pb-57454dc4`) was refused at plan node
// indices, could not find the steps, and resent its script unchanged; every
// issue now carries its step and line (`../authoring/locate-issue.ts`), and
// `next` opens by naming each refused step by line and name. Lane D's three
// different filter-list defects ended its build as "the same refusal" because
// the run was keyed on the refusal's category alone; it is now keyed on the
// issues themselves -- their codes and the lines they are about -- so only a
// submission refused for exactly what refused the last one continues a run.

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
    evidence: { ok: false, revision: submitted.revision, diagnostics: feedback, issueCodes: [...submitted.check.issueCodes], next: refusedSteps(feedback) + (handles.length ? handleNext(handles) : GENERAL_NEXT) },
    resultCode: refusalCode(feedback, submitted.check.issueCodes),
    draft: { proposes: true }
  };
}

/** How long a digest of the refused issues is, in hex digits. */
const ISSUES_DIGEST_LENGTH = 8;

/**
 * What makes two refusals "the same" for the run of refusals: the refusal's own
 * category and a digest of its issues -- each code with the line (or, with
 * none, the path) it is about. Two submissions refused for different defects
 * are different refusals, however alike their category (header).
 */
function refusalCode(feedback: JsonObject, issueCodes: readonly string[]): string {
  const named = [feedback.refusal, feedback.code, issueCodes[0]].find((code): code is string => typeof code === "string" && CLOSED_CODE.test(code));
  const category = named ?? AUTOMATION_STUDIO_CANDIDATE_SUBMISSION_REFUSED_CODE;
  const keys = [...new Set(issuesOf(feedback).map((issue) => `${String(issue.code)}@${typeof issue.line === "number" ? issue.line : typeof issue.path === "string" ? issue.path : ""}`))].sort();
  if (!keys.length) return category;
  return `${category.slice(0, 100 - ISSUES_DIGEST_LENGTH - 1)}:${digest(keys.join("\n"))}`;
}

/** FNV-1a over the text, as hex: stable across processes, and only ever compared for equality. */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(ISSUES_DIGEST_LENGTH, "0");
}

/** The longest a step's own words are quoted back in `next`. */
const STEP_WORDS_LIMIT = 120;

/** Each refused step by its line and the model's own words for it, once each, in script order; empty when no issue names a step. */
function refusedSteps(feedback: JsonObject): string {
  const named = new Map<string, { line: number | undefined; text: string }>();
  for (const issue of issuesOf(feedback)) {
    if (typeof issue.step !== "string" || !issue.step.trim()) continue;
    const line = typeof issue.line === "number" ? issue.line : undefined;
    const words = JSON.stringify(issue.step.replace(/\s+/gu, " ").trim().slice(0, STEP_WORDS_LIMIT));
    const label = typeof issue.label === "string" && issue.label ? ` (${issue.label})` : "";
    const text = line === undefined ? `${words}${label}` : `line ${line}, ${words}${label}`;
    if (!named.has(text)) named.set(text, { line, text });
  }
  if (!named.size) return "";
  const ordered = [...named.values()].sort((a, b) => (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER));
  return `${ordered.length === 1 ? "The refused step is" : "The refused steps are"} ${ordered.map((entry) => entry.text).join("; ")}: correct ${ordered.length === 1 ? "that step" : "those steps"}, where each issue says. `;
}

/** The issue entries a refusal's feedback carries, as objects. */
function issuesOf(feedback: JsonObject): JsonObject[] {
  const issues: JsonValue[] = Array.isArray(feedback.issues) ? feedback.issues : [];
  return issues.filter((issue): issue is JsonObject => Boolean(issue) && typeof issue === "object" && !Array.isArray(issue));
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
