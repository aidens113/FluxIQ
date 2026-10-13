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
//
// **Each handle code has its own advice (t383).** Every `<domain>.handle.*`
// code was answered with the advice for a handle no view printed, so lane D
// (`run-mv0pcfaf-cd251bdc`, step 0034) was told its list's handle
// `extraction.3` "does not name one control in any view" when the list was
// right and a condition named a column the step did not keep
// (`web.handle.unknown_field`). The advice is now chosen by the reason after
// `.handle.` -- `unknown`, `stale`, `unknown_field`, ... -- each saying only
// what that reason means and how to get past it; a reason with no advice here
// is answered with the general advice, never with another reason's.
//
// **A handle the build acted on is named where it still stands (t442).** R4a
// and R4b (`run-mv4dcf2j-cb68009a`, `run-mv4dgmki-2b13db91`) pressed each
// popup's close control while exploring, and every view that printed those
// controls had since been replaced; the only handles left for the popups were
// lines of text the presses removed, so the model copied those, was refused
// (`not_a_control`, `unknown`), and copied the next such line. The advice for
// those two reasons now says where the control's handle still is -- the result
// of the call that acted on it -- and that `core.recall_result` gives back a
// replaced view whole. Said once, however many issues give either reason.
//
// **A corrected resubmission is a new refusal (t442).** The run of refusals
// was keyed on each issue's code and line alone, so R4a's second submission,
// which changed every refused handle, counted as the same refusal again, and
// one more would have ended a build that was correcting itself each time. The
// key now carries the handles each issue refused as well, so only a
// resubmission refused for the same issue on the same values continues a run.
//
// **An unknown column names the names it can use, and a stale detection says
// so (t502).** Lane D round 16 (`run-mv6i2akr-516b2f03`, D1) wrote a column key
// inside a read's `fields` that it had built from the page after an act; the
// read's detection, taken before the act, had no such column. The advice said
// the list's handle was right and changing it would not help, when a fresh
// detection -- a new handle -- was exactly the fix. The advice for
// `unknown_field` now quotes the names the issues say the step can use
// (`valid`, Core's own detail, `../plan/issue-feedback.ts`). And where the
// domain's refusal also gives `columns_changed` -- its evidence that the name
// is one of the list's own columns with a part changed, so the items changed
// since the detection -- the advice no longer calls the handle right, and says
// to detect the list again. That reason is read from the refusal, never
// guessed here; with no such issue the advice is the one t383 gave.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowCandidateSubmission } from "./contracts.ts";

/** The code a refused submission is counted under when its check names no closed code of its own. */
export const AUTOMATION_STUDIO_CANDIDATE_SUBMISSION_REFUSED_CODE = "candidate.submission_refused";

/** A result code the loop accepts (`../../llm/evidence-loop-decision.ts`). */
const CLOSED_CODE = /^[a-z0-9_.:-]{1,100}$/iu;
/** Issue codes about a handle a step names, with the reason they give (`web.handle.unknown_field:extractList.where.0.field` is `unknown_field`). */
const HANDLE_ISSUE = /^[a-z]+\.handle\.([a-z_]+)(?::|$)/u;

/** What ends a run of refusals, said after every way out. */
const RESUBMIT = "Sending the same refused script, or one refused for the same reason, a third decision in a row ends this build.";
// A refusal stays in evidence for every later decision, so this says only what
// stays true of it: once a revision is accepted, its script is the one to edit,
// and a refused script is never the current Flow (t498, `./authoring-loop.ts`).
const GENERAL_NEXT = "Correct every listed issue in your current Flow's script -- the latest accepted revision's, where one was accepted (current names it), or else previous, the script this call sent -- "
  + `keep every other line as it is, and submit the whole candidate again. ${RESUBMIT}`;
const HANDLE_TAIL = `Correct every other listed issue as it says, keep every other line as it is, and submit the whole candidate again. ${RESUBMIT}`;

/** "The handle t1" or "The handles t1, t2", or `none` when the issue named no handle. */
function named(handles: readonly string[], none: string): string {
  return handles.length === 0 ? none : `${handles.length === 1 ? "The handle" : "The handles"} ${handles.join(", ")}`;
}

/** What the refusal's issues said beside their reasons: every reason given, the names the step wrote that were refused (`field`), and the names it can use (`valid`), each once, in order. */
type ReasonEvidence = { reasons: ReadonlySet<string>; fields: readonly string[]; valid: readonly string[] };

/** A name an issue's detail may carry, as Core keeps it (`../plan/issue-feedback.ts`): identifier characters only. */
const DETAIL_NAME = /^[A-Za-z0-9_.:-]{1,200}$/u;
/** The most names one advice quotes; the issues list every one. */
const NAMES_QUOTED = 24;

/** The names quoted, at most `NAMES_QUOTED` of them, with how many more the issues list. */
function quoted(names: readonly string[]): string {
  const shown = names.slice(0, NAMES_QUOTED).map((name) => JSON.stringify(name)).join(", ");
  return names.length > NAMES_QUOTED ? `${shown}, and ${names.length - NAMES_QUOTED} more the issues list` : shown;
}

/** The unknown-column advice (t383, t502): what was refused, the names it can use, and -- unless the refusal says the items changed since the detection -- that the list's handle is right. */
function unknownFieldAdvice(handles: readonly string[], said: ReasonEvidence): string {
  const changed = said.reasons.has("columns_changed");
  const opening = changed ? "A column the step names"
    : `${handles.length ? `The list ${handles.join(", ")} is right, so changing its handle will not help` : "The list's handle is right"}: a column the step names`;
  const names = !said.valid.length ? ""
    : changed ? `The columns the list had when it was detected are ${quoted(said.valid)}. `
    : `The names this step can use there are ${quoted(said.valid)}. `;
  return `${opening}, in its fields or in a condition (where), is neither one the list's detection printed nor a key this same step keeps in its own fields. ${names}`
    + (changed ? "" : "A condition reads only its own step's row, so a key another step keeps is not one of its columns. Name the column by a key the detection printed for this list, or by a key this step's fields keep -- adding the column to this step's fields first if it is not there -- or drop the condition. ");
}

/**
 * The advice for each reason a handle is refused, keyed by the reason after
 * `.handle.`. Each is true of that reason alone; tokens quoted are handles the
 * model itself wrote, and names an issue's own detail carried (t502).
 */
const HANDLE_ADVICE: Readonly<Record<string, (handles: readonly string[], said: ReasonEvidence) => string>> = Object.freeze({
  unknown: (handles) => `${named(handles, "A handle the step names")} ${handles.length > 1 ? "do" : "does"} not name one control in any view this build was shown, so copying ${handles.length > 1 ? "them" : "it"} again will be refused again. `
    + "A step may name a control from any view this build printed, on any page it visited, copied exactly as that view printed it; a handle no view printed, or written from memory, cannot be a step's target. "
    + "To act on a control on the page this step runs on, look at that page (go there, then capture it) and copy the handle that view prints for the control; "
    + "if the Flow does not need the step -- the control is not on the page when the Flow gets there -- drop it. ",
  renumbered_by_reload: (handles) => `${named(handles, "A handle the step names")} came from a view taken before the page was reloaded, and the reload numbered its controls anew, so it names nothing now. Look at the page again and copy the control's current handle from that view. `,
  stale: (handles) => `${named(handles, "A handle the step names")} came from a view of a page this build no longer holds (it keeps only the pages it saw most recently), so it cannot be resolved. Look at the page the step runs on again and copy the handle that new view prints for the control. `,
  not_unique: (handles) => `${named(handles, "A handle the step names")} names a control whose page gave the same address to more than one element, so acting on it would be a guess. Look at the page again and choose a handle that names one element. `,
  ambiguous: (handles) => `What the step names${handles.length ? ` (with ${handles.join(", ")})` : ""} reads more than one way: one handle naming different controls on different pages (write the location its view reported beside it), two of the step's parameters naming different controls, or a column name that fits two columns exactly (use the exact key). Make each name one thing. `,
  misplaced: (handles) => `${named(handles, "A handle the step names")} is written in a parameter that takes no handle of its kind -- a list's handle where a control belongs, a control's where a list belongs, or a handle where a plain value goes. Move it to the parameter the node's description names for it (accepted, where given). `,
  malformed: () => "Something the step wrote where a handle, or a list's column or condition, belongs is not in a shape it takes. Write it as accepted shows, where given, with each handle copied exactly as a view printed it. ",
  frame_mismatch: () => "The step names a frame other than the one its control is in, or controls in two frames. Remove the step's own frame setting and name controls of one frame. ",
  extraction_required: () => "A list is read only through its handle, so a read written out by hand is refused: detect the list, then name it by the handle its view printed, with fields naming that list's columns. ",
  // A control named by anything but a handle (t432): an address, an identity or a description of the model's own.
  not_a_handle: () => "A step names a control by something other than a handle. Name every control only by the handle the page view printed for it, copied exactly -- `target: t5` -- and write nothing else about it: no address, no description of the element, no identity of your own. If no view printed the control, look at the page the step runs on first. ",
  not_a_control: (handles) => `${named(handles, "A handle the step names")} names text the view printed, not a control a press acts on. Copy the handle the view prints for the control itself, or drop the step if the Flow does not need it. `,
  wrong_control: (handles) => `${named(handles, "A handle the step names")} names a known control that this node cannot act on; that does not prove it is the control the instruction needs. `
    + "If this is the intended control, use the node that can act on its kind (an issue names one where known). "
    + "If it is a different control, keep the intended action and copy the observed handle for the control that action needs. Recheck the step's purpose against the control's words and kind before changing either. ",
  unknown_field: unknownFieldAdvice,
  // The domain's evidence that the detection is out of date (header, t502): the name is one of the list's columns with a part changed.
  columns_changed: (handles, said) => `${said.fields.length ? `The name ${quoted(said.fields)} is` : "The column the step names is"} one of ${handles.length ? `the list ${handles.join(", ")}'s` : "the list's"} own columns with a part changed, and that list's detection has no such column: the list's items have changed since it was detected (a press or other act on the page often adds or replaces a column), so another of its old columns would read something else. `
    + "Detect the list again on the page as it is when the step runs, then name the list by the handle that detection prints and the column by a key it prints. "
});

/** The reasons whose refused handle may be text an act removed, or a control only a replaced view printed (header). */
const ACTED_CONTROL_REASONS: ReadonlySet<string> = new Set(["unknown", "not_a_control"]);
/** Where a control the build already acted on is still named, said once after those reasons' advice (header). */
const ACTED_CONTROL = "If the step acts on a control this build already acted on while exploring, the result of that call names the control by its handle beside its words, and keeps it after its view is replaced: copy that handle, never a line of text the act removed. "
  + "A view a newer one replaced is given back whole by core.recall_result with the callId of the result that showed it. ";

/** The evidence and loop statement for one refused submission. */
export function automationStudioCandidateSubmissionRefusal(submitted: Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>): {
  evidence: JsonObject;
  resultCode: string;
  draft: { proposes: true };
} {
  const feedback = submitted.check.feedback ?? {};
  const advice = handleAdvice(feedback);
  // A Flow sent again unchanged lists no issue to correct: its own instruction
  // says what failed last and the way out (t464, `./unchanged-submission.ts`).
  const next = feedback.unchanged === true && typeof feedback.instruction === "string"
    ? `${feedback.instruction} ${RESUBMIT}`
    : refusedSteps(feedback) + (advice ? advice + HANDLE_TAIL : GENERAL_NEXT);
  return {
    evidence: { ok: false, revision: submitted.revision, diagnostics: feedback, issueCodes: [...submitted.check.issueCodes], next },
    resultCode: refusalCode(feedback, submitted.check.issueCodes),
    draft: { proposes: true }
  };
}

/** How long a digest of the refused issues is, in hex digits. */
const ISSUES_DIGEST_LENGTH = 8;

/**
 * What makes two refusals "the same" for the run of refusals: the refusal's own
 * category and a digest of its issues -- each code with the line (or, with
 * none, the path) it is about, and the handles it refused (t442). Two
 * submissions refused for different defects, or for the same defect on
 * different values, are different refusals, however alike their category
 * (header).
 */
function refusalCode(feedback: JsonObject, issueCodes: readonly string[]): string {
  const named = [feedback.refusal, feedback.code, issueCodes[0]].find((code): code is string => typeof code === "string" && CLOSED_CODE.test(code));
  const category = named ?? AUTOMATION_STUDIO_CANDIDATE_SUBMISSION_REFUSED_CODE;
  const keys = [...new Set(issuesOf(feedback).map((issue) => `${String(issue.code)}@${typeof issue.line === "number" ? issue.line : typeof issue.path === "string" ? issue.path : ""}#${refusedHandles(issue)}`))].sort();
  if (!keys.length) return category;
  return `${category.slice(0, 100 - ISSUES_DIGEST_LENGTH - 1)}:${digest(keys.join("\n"))}`;
}

/** The handles one issue refused (`../plan/issue-feedback.ts`, `handles`), each with the location written beside it, sorted; empty when it names none. */
function refusedHandles(issue: JsonObject): string {
  const handles: JsonValue[] = Array.isArray(issue.handles) ? issue.handles : [];
  return handles
    .filter((entry): entry is JsonObject => entry !== null && typeof entry === "object" && !Array.isArray(entry) && typeof entry.handle === "string")
    .map((entry) => `${String(entry.handle)}${typeof entry.location === "string" ? `@${entry.location}` : ""}`)
    .sort()
    .join(",");
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

/**
 * What to do about the handle issues, one advice per reason in the order the
 * issues first give it, each naming the handles its own issues carry
 * (`../plan/issue-feedback.ts`, `handles`), once each, as written; empty when
 * no issue gives a reason this module has advice for.
 */
function handleAdvice(feedback: JsonObject): string {
  const byReason = new Map<string, { handles: Set<string>; fields: Set<string>; valid: Set<string> }>();
  for (const issue of issuesOf(feedback)) {
    const reason = typeof issue.code === "string" ? HANDLE_ISSUE.exec(issue.code)?.[1] : undefined;
    if (reason === undefined || !Object.hasOwn(HANDLE_ADVICE, reason)) continue;
    const found = byReason.get(reason) ?? { handles: new Set<string>(), fields: new Set<string>(), valid: new Set<string>() };
    byReason.set(reason, found);
    const handles: JsonValue[] = Array.isArray(issue.handles) ? issue.handles : [];
    for (const entry of handles) {
      if (entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.handle === "string" && CLOSED_CODE.test(entry.handle)) found.handles.add(entry.handle);
    }
    if (typeof issue.field === "string" && DETAIL_NAME.test(issue.field)) found.fields.add(issue.field);
    const valid: JsonValue[] = Array.isArray(issue.valid) ? issue.valid : [];
    for (const name of valid) if (typeof name === "string" && DETAIL_NAME.test(name)) found.valid.add(name);
  }
  const reasons: ReadonlySet<string> = new Set(byReason.keys());
  const advice = [...byReason].map(([reason, found]) => HANDLE_ADVICE[reason]!([...found.handles], { reasons, fields: [...found.fields], valid: [...found.valid] })).join("");
  return [...byReason.keys()].some((reason) => ACTED_CONTROL_REASONS.has(reason)) ? advice + ACTED_CONTROL : advice;
}
