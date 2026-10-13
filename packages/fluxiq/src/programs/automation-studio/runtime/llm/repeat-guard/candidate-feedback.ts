// What the model is told, in candidate mode, when a call is refused as a
// repeat (`./feedback.ts`, `./outcomes.ts`).
//
// Candidate mode has no draft (the loop is `discoveryOnly`): nothing can be
// amended, rerun or marked optional, and a round that stalls is not followed by
// a test and judgement of a Flow so far -- the build ends, with nothing tested.
// The legacy notes say both, which lane C (`run-mv0fuotv-805294d7`, C2) was
// told three times for one refused script it sent again unchanged, until the
// build ended with its purse unspent. So in candidate mode no note names the
// draft, and an identical `core.submit_candidate` is answered with the issues
// its first refusal listed, as that refusal gave them (each names the step and
// line it is about, and what to write instead where the check knows).
//
// **The note names the earlier call, and a refusal with no issues is not
// said to have them (t489, F5).** Lane D round 13 (`run-mv66sc3c-c47e74b8`,
// 0044 and 0062) sent an unchanged submission again and was told its issues
// were "listed under issues as that refusal gave them". An unchanged refusal
// (`candidate.unchanged_submission`, `candidate.unchanged_after_no`) lists none:
// what failed is under its `lastTrial`, or `judged` after a no. So every
// refused submission's note names the call that was refused, and one with no
// issues says where that refusal put what failed and what to change.
//
// **The note repeats the exact fix (t514).** Social gate run
// `run-mv6v2jh4-69244ffb` (0087-0091) sent its refused script three more times
// and was told only to change the lines its issues named; the build ended. A
// refused submission's note now says again, with each line and step, the fix
// each issue carried (`instead`), and points to `core.describe_nodes` -- with
// the node ids the issues name (`node`) -- for what a step's node takes.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRepeatedOutcome } from "./outcomes.ts";
import { automationStudioLlmEvidenceRepeatPermissionRefused } from "./permission-refused.ts";

/** The candidate submission tool (`../../flow-bootstrap/candidate/authoring-loop.ts`), read as a plain string so this module does not reach into the build. */
const SUBMIT_CANDIDATE = "core.submit_candidate";

const SAME_CALL = "You already made this exact call -- the same tool with the same input -- on this exact page, and it did not work then, changed nothing, or ended on the same page as the same call before it (then.outcome). "
  + "Making it again from this page does the same, so it was not run and cost nothing but this decision. "
  + "Do something different instead: look at or search the page for what you need, use a different control or a different input, submit a corrected candidate, or ask the person. "
  + "A call that runs after the page has changed is not a repeat.";

/** Said instead for a call the permission gate refused (`./permission-refused.ts`, t471). */
const AUTOMATION_STUDIO_LLM_EVIDENCE_PERMISSION_REPEAT_INSTRUCTION = "You already made this exact call, and it was refused because it needs a person's permission that it does not have (then.resultCode, then.resultReason): "
  + "it would do something gated -- delete, move money, send or publish -- that nobody granted, or that the person declined. "
  + "Sending it again cannot get past that, on this page or any other, so it was not run. Do not make this call again. "
  + "If it was meant to undo something this build did, that is already undone or is not this build's: check what this build did against what the page shows. "
  + "Then go on without it: take a way that needs no such permission, or test or submit the candidate with what you have.";

const SAME_LOOK = "You already made this exact look -- the same tool with the same input -- on this exact page, and it answered the same twice: its answer is above, under sameAsCall. "
  + "The page has not changed, so asking again answers the same again; it was not run. "
  + "Change your approach: act on what the answers show (press, type into or choose a control the page shows), go to another page, use the page's own search or menus, or look for something different.";

const HANDLE_UNSHOWN = "You already made this exact call -- the same tool with the same input -- on this exact page, and it failed because a handle it names was never shown here (then.resultReason): no call had shown or minted that handle yet, and none has since, so it was not run. "
  + "The call itself may be right. First make the call that shows the handle: look at the page, which lists each control under its handle, "
  + "or for a list's extraction handle detect the list's repeating structure from one of its items, which mints the handle and its fields. "
  + "Once a call has shown it, this same call may be made again with the handle exactly as shown.";

/** A refused submission sent again, whose refusal listed issues; `call` is the refused call's id. */
function refusedSubmission(call: string, issues: readonly JsonValue[]): string {
  return `You already submitted this exact candidate -- the same script, word for word -- in call ${call}, and it was refused (sameAsCall, then.resultCode). `
    + "It was the same script, so it was not checked again: it is refused for the same issues, listed under issues as that refusal gave them. "
    + "Change the lines those issues name (each names its step and line where the refusal gave them, and what to write instead where it knows), keep every other line as it is, and submit the whole candidate again."
    + exactFixes(issues) + describeNodes(issues);
}

/** An identifier a refusal's issue names: a node id, quoted back as written. */
const NODE_ID = /^[A-Za-z0-9_.:-]{1,200}$/u;
/** The longest a step's own words are quoted back. */
const STEP_WORDS_LIMIT = 120;

/**
 * Each issue's own fix, said again with its line and step (header, t514): the
 * `instead` the refusal carried, which is Core's sentence.
 */
function exactFixes(issues: readonly JsonValue[]): string {
  const fixes = new Set<string>();
  for (const issue of issues) {
    if (!isObject(issue) || typeof issue.instead !== "string" || !issue.instead.trim()) continue;
    const line = typeof issue.line === "number" ? `line ${issue.line}` : undefined;
    const step = typeof issue.step === "string" && issue.step.trim() ? JSON.stringify(issue.step.replace(/\s+/gu, " ").trim().slice(0, STEP_WORDS_LIMIT)) : undefined;
    const place = [line, step].filter(Boolean).join(", ");
    fixes.add(`${place ? `${place}: ` : ""}${issue.instead.trim()}`);
  }
  return fixes.size ? ` The fix ${fixes.size === 1 ? "that refusal gave is" : "those refusals gave are"}: ${[...fixes].join(" ")}` : "";
}

/** Where to learn what a node takes (header, t514): `core.describe_nodes`, with the nodes the issues name. */
function describeNodes(issues: readonly JsonValue[]): string {
  const nodes = [...new Set(issues.flatMap((issue) => isObject(issue) && typeof issue.node === "string" && NODE_ID.test(issue.node) ? [issue.node] : []))];
  if (!nodes.length) return " If you are not sure what a step's node takes, call core.describe_nodes with the node id its node: line names before you submit again: it lists every parameter the node takes and in what form.";
  return ` If you are not sure what ${nodes.length === 1 ? "that step's node takes" : "those steps' nodes take"}, call core.describe_nodes with ids ${JSON.stringify(nodes)} before you submit again: it lists every parameter the node takes and in what form.`;
}

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A submission refused as unchanged, sent again: its refusal named no issues, only what failed last (header, t489). */
function unchangedSubmission(call: string): string {
  return `You already submitted this exact candidate -- the same script, word for word -- in call ${call}, and it was refused as unchanged (sameAsCall, then.resultCode): it is the Flow of a revision already made. `
    + "It was the same script, so it was not checked again. That refusal lists no issues: what failed is in its answer, under lastTrial (the step that stopped, and what it says happened), or under judged after the judge's no. "
    + "Change the step that feedback names, or the steps that lead to it, keep every other line as it is, and submit the whole changed candidate; "
    + "test the same revision again with core.test_candidate only if that feedback says trying again may pass.";
}

/** Any other refused submission with no issues, sent again. */
function refusedWithoutIssues(call: string): string {
  return `You already submitted this exact candidate -- the same script, word for word -- in call ${call}, and it was refused (sameAsCall, then.resultCode, then.resultReason). `
    + "It was the same script, so it was not checked again, and it is refused for the same reason. That refusal lists no issues: read its answer in call "
    + `${call} for what it names, change what it names, keep every other line as it is, and submit the whole changed candidate.`;
}

/** The refusal codes of a submission that changed nothing (`../../flow-bootstrap/candidate/unchanged-submission.ts`), read as plain strings. */
const UNCHANGED_CODES: ReadonlySet<string> = new Set(["candidate.unchanged_submission", "candidate.unchanged_after_no"]);

const ACCEPTED_SUBMISSION = "You already submitted this exact candidate -- the same script, word for word -- and it was accepted, with the revision and digest it returned (sameAsCall). "
  + "Submitting it again changes nothing, so it was not run. Test that revision, complete with it once its trial answers yes, or submit a changed candidate.";

/** What happens if the same is sent again: this many refused in a row end the build. */
function ending(inARow: number, maxInARow: number, what: string): string {
  if (inARow >= maxInARow - 1) return ` Sending ${what} unchanged again ends this build with nothing tested.`;
  return ` Sending ${what} unchanged again is refused the same way, and ${maxInARow} repeats refused in a row end this build with nothing tested.`;
}

/** The instruction, and for a refused submission its issues, for one repeat refused in candidate mode. */
export function automationStudioLlmEvidenceCandidateRepeatInstruction(input: {
  toolId: string;
  earlier: AutomationStudioLlmEvidenceRepeatedOutcome;
  inARow: number;
  maxInARow: number;
}): { instruction: string; issues?: JsonValue[] } {
  const { toolId, earlier, inARow, maxInARow } = input;
  if (toolId === SUBMIT_CANDIDATE) {
    if (earlier.outcome !== "failed") return { instruction: ACCEPTED_SUBMISSION + ending(inARow, maxInARow, "it") };
    if (earlier.issues) return { instruction: refusedSubmission(earlier.callId, earlier.issues) + ending(inARow, maxInARow, "it"), issues: structuredClone(earlier.issues) };
    const said = earlier.resultCode !== undefined && UNCHANGED_CODES.has(earlier.resultCode) ? unchangedSubmission(earlier.callId) : refusedWithoutIssues(earlier.callId);
    return { instruction: said + ending(inARow, maxInARow, "it") };
  }
  if (earlier.outcome === "same_answer") return { instruction: SAME_LOOK + ending(inARow, maxInARow, "the same look") };
  if (earlier.handleUnshown) return { instruction: HANDLE_UNSHOWN + ending(inARow, maxInARow, "this call") };
  if (automationStudioLlmEvidenceRepeatPermissionRefused(earlier)) return { instruction: AUTOMATION_STUDIO_LLM_EVIDENCE_PERMISSION_REPEAT_INSTRUCTION + ending(inARow, maxInARow, "this call") };
  return { instruction: SAME_CALL + ending(inARow, maxInARow, "this call") };
}
