// What of the person's request a Flow does not do yet, as an ending carries it
// and as the person reads it.
//
// Both come from the checklist (`../instructed-acts/checklist.ts`): the ids
// and the person's own words for each act and choice still to do, and the
// checklist's reason put into a plain clause. Nothing here is page content.
import type { AutomationStudioInstructedActChecklistItem, AutomationStudioInstructedActObjectTodo, AutomationStudioInstructedActTodo } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapUnfinishedStop } from "./contracts.ts";

const MAX_QUOTE = 200;
const MAX_SAID_QUOTE = 90;
const MAX_SAID = 4;
/** The longest reason a repair heading quotes. */
const MAX_REASON = 160;

/** Each reason, as a clause that finishes "... : <quote> -- ". Every reason the checklist gives has its own. */
const TODO_WORDS: Readonly<Record<AutomationStudioInstructedActTodo | AutomationStudioInstructedActObjectTodo, string>> = Object.freeze({
  no_step_added: "nothing I tried did it",
  step_not_kept: "the step I tried for it is not in the Flow",
  step_changed_nothing: "the step I tried for it changed nothing",
  step_only_reads: "the step I named for it only read the page, and did not do it",
  step_only_arrives: "the step I tried for it only opened a page",
  step_is_optional: "the step for it may be skipped, so it might never happen",
  act_needs_repeat: "it has to be done for every item, and I found no way to repeat it over them",
  span_stops_short: "part of it ran once after the loop instead of on every item",
  act_consequence_undeclared: "the step for it did not say it needs your permission, so you were never asked",
  choice_is_the_act_step: "the step that adds the item does not set it",
  step_claimed_twice: "the step I tried for it already does something else",
  step_acts_on_another_object: "the step I named for it acted on a different item from the one you asked for",
  quantity_is_a_repeat: "the step for how many ran once for each item of a list, not that many times on this item",
  quantity_presses_differ: "the step for how many did not add it exactly the number of times you asked"
});

/** Why each round stopped, as a clause that finishes "The build stopped because ...". */
const STOP_WORDS: Readonly<Record<AutomationStudioFlowBootstrapUnfinishedStop, string>> = Object.freeze({
  iterations: "it used every decision it had without the Flow being finished",
  tool_calls: "it used every action it had without the Flow being finished",
  // Any run of decisions the loop could not use ends a round this way -- a
  // completion refused, an edit to the Flow that changed nothing, a call
  // refused as a repeat -- so the words claim none of them. Live run
  // `run-muqiojz4-04a7a8fc` was told "every attempt to finish was refused"
  // after five refused amendments and no attempt to finish at all.
  unusable_decisions: "too many of its decisions in a row could not be used",
  repeat_without_progress: "it kept repeating itself without getting further",
  // A `no`, an unsure verdict, one not judged, or a yes about another version
  // of the Flow or about no test (user, 2026-10-02): none is a judged success.
  judged_wrong: "the Flow it said was ready was not judged to do what you asked"
});

/** The acts and choices not done, as the ending's record keeps them. */
export function automationStudioFlowBootstrapNotDone(checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined): AutomationStudioFlowBootstrapBuildEnding["notDone"] {
  return (checklist ?? []).flatMap((item) => [
    ...(item.done === undefined ? [{ id: item.id, quote: bounded(item.quote, MAX_QUOTE), todo: item.todo ?? "no_step_added" }] : []),
    ...(item.choices ?? []).filter((choice) => choice.done === undefined).map((choice) => ({ id: choice.id, quote: bounded(choice.quote, MAX_QUOTE), todo: choice.todo ?? "no_step_added" }))
  ]).slice(0, 16);
}

/** "`"add two packs ..."`: nothing I tried did it; ..." -- at most four, then how many more. */
export function automationStudioFlowBootstrapNotDoneSaid(notDone: AutomationStudioFlowBootstrapBuildEnding["notDone"]): string {
  const said = notDone.slice(0, MAX_SAID).map((item) => `"${bounded(item.quote, MAX_SAID_QUOTE)}": ${TODO_WORDS[item.todo as AutomationStudioInstructedActTodo | AutomationStudioInstructedActObjectTodo] ?? "nothing I tried did it"}`);
  const more = notDone.length > MAX_SAID ? `; and ${notDone.length - MAX_SAID} more` : "";
  return `${said.join("; ")}${more}`;
}

/** A refusal the model was shown, as the clause that finishes "... because ...". First match wins. */
const BLOCKED_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^bootstrap\.instructed_act_missing$/u, "the Flow did not yet do what you asked"],
  [/^bootstrap\.cannot_answer_instruction$/u, "the Flow could not give the answer you asked for"],
  [/dry_run|replay/u, "a step did not work when the Flow was run from its start"],
  [/permission/u, "a step needed your permission"],
  [/^llm_output\.|malformed|unreadable|provider_output/u, "the model's replies could not be read"],
  [/^llm_evidence_loop\.(?:already_answered|already_observed|look_withdrawn|no_progress)/u, "the model kept asking for what it had already been shown"],
  // Its edits to the draft, refused again and again (`../../llm/draft-amendment-feedback.ts`).
  [/^llm_evidence_loop\.draft_amendments?_(?:refused|undone)$/u, "the model kept asking for changes to the Flow that changed nothing"],
  // A call refused unrun, because the same call had already failed or changed nothing there (`../../llm/repeat-guard/`).
  [/^llm_evidence_loop\.repeat_refused$/u, "the model kept trying again what had already failed or changed nothing"],
  [/plan|flow_draft|validation|node|subflow/u, "the Flow it wrote was not one that could run"]
];

/**
 * What blocked the build, in plain words, from the last refusals the model was
 * shown: at most two distinct reasons, or nothing when none is known.
 */
export function automationStudioFlowBootstrapBlockedSaid(issueCodes: readonly string[]): string {
  const said = [...new Set(issueCodes.flatMap((code) => {
    const words = BLOCKED_WORDS.find(([pattern]) => pattern.test(code))?.[1];
    return words ? [words] : [];
  }))].slice(0, 2);
  return said.join(", and ");
}

/**
 * What the last test found, as a sentence. A Flow that ran clean but does
 * not do all that was asked is not said to have run "without failing": live run
 * 36 (`run-muq3uozx-3153564b`) told the person so while its acts were refused
 * and two wrong requests had been confirmed while it explored.
 */
export function automationStudioFlowBootstrapTestSaid(judgement: AutomationStudioFlowBootstrapJudgement | undefined): string {
  if (judgement?.judge) return judgedTestSaid(judgement);
  // Steps carried from an earlier Flow and never rerun: the Flow was never run whole, which is said, never left unsaid (t194-w70).
  if (judgement?.notRunInThisBuild?.length) return notRunTestSaid(judgement.stepsInFlow, judgement.notRunInThisBuild);
  if (!judgement || judgement.tested === "not_tested") return judgement && judgement.stepsInFlow === 0 ? "No step I found belonged in the Flow." : "";
  const steps = `${judgement.stepsInFlow} step${judgement.stepsInFlow === 1 ? "" : "s"}`;
  if (judgement.tested === "replayed_clean") {
    if (!judgement.todo.length) return `The Flow as far as it got (${steps}) ran from its start without failing.`;
    return judgement.done === 0
      ? `The Flow as far as it got (${steps}) ran from its start, but it does none of what you asked.`
      : `The Flow as far as it got (${steps}) ran from its start, but it does not yet do all you asked.`;
  }
  const failed = judgement.failedSteps.length ? ` step ${judgement.failedSteps.slice(0, 3).join(", ")}` : " a step";
  return `When the Flow as far as it got (${steps}) was run from its start,${failed} did not work.`;
}

/**
 * The test of a Flow the model said was ready, which was not judged a
 * success: it ran clean and was judged wrong, so it is never said to have
 * failed, nor to have done what was asked; or it ran clean and the judge could
 * not say; or steps carried from an earlier Flow were not run in it at all; or
 * what was judged was not a test of this Flow (user, 2026-10-02).
 */
function judgedTestSaid(judgement: AutomationStudioFlowBootstrapJudgement): string {
  const steps = `${judgement.stepsInFlow} step${judgement.stepsInFlow === 1 ? "" : "s"}`;
  const carried = judgement.judge?.untestedCarried ?? [];
  if (!carried.length && judgement.notRunInThisBuild?.length) return notRunTestSaid(judgement.stepsInFlow, judgement.notRunInThisBuild);
  if (carried.length) {
    return `Step${carried.length === 1 ? "" : "s"} ${carried.slice(0, 6).join(", ")}${carried.length > 6 ? " and more" : ""} of the Flow (${steps}) came from the earlier Flow and ${carried.length === 1 ? "was" : "were"} not run when it was tested, so what ${carried.length === 1 ? "it does" : "they do"} could not be judged.`;
  }
  if (judgement.judge?.verdict === "no") return `The Flow (${steps}) ran from its start, but what it did was judged not to be what you asked.`;
  if (judgement.tested === "not_tested") return `The Flow as it now stands (${steps}) was not run whole from its start and judged, so it was not judged to do what you asked.`;
  return `The Flow (${steps}) ran from its start, but what it did was not judged to be what you asked.`;
}

/** A Flow holding steps carried from an earlier Flow and never rerun in this build, as an ending says it. */
function notRunTestSaid(stepsInFlow: number, notRun: readonly number[]): string {
  const steps = `${stepsInFlow} step${stepsInFlow === 1 ? "" : "s"}`;
  return `The Flow as it stands (${steps}) was never run whole from its start: ${positionsSaid(notRun)} came from the Flow being changed and ${notRun.length === 1 ? "was" : "were"} not run again in this build, so it was never tested or judged.`;
}

/**
 * The repair's announcement for a Flow holding steps carried from an earlier
 * Flow that never ran in this build (t194-w70): which, and that each is run
 * again live before the Flow can be tested; and, when the round before held
 * them too and ran none of them, that it did not.
 */
export function automationStudioFlowBootstrapRepairingNotRunSaid(notRun: readonly number[], ranNoneAgain: boolean): string {
  const which = `${positionsSaid(notRun)} came from the Flow being changed and ${notRun.length === 1 ? "has" : "have"} not run in this build`;
  const again = ranNoneAgain ? ` The last round ran none of ${notRun.length === 1 ? "it" : "them"} again.` : "";
  return `The Flow could not be tested from its start: ${which}.${again} Repairing it live, running ${notRun.length === 1 ? "it" : "each"} again so the whole Flow can be tested and judged.`;
}

/** "step 3", "steps 1 and 2", "steps 1, 2 and 4": at most eight, then how many more. */
function positionsSaid(positions: readonly number[]): string {
  const MOST = 8;
  if (positions.length === 1) return `step ${positions[0]}`;
  const shown = positions.slice(0, MOST);
  const more = positions.length - shown.length;
  const list = more ? `${shown.join(", ")} and ${more} more` : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
  return `steps ${list}`;
}

/**
 * The repair's announcement after a judge, naming its reason in its own words,
 * bounded: what it found wrong, or that the Flow is not yet confirmed to do
 * what was asked and why (user, 2026-10-02).
 *
 * A judge that did not settle it is said as the card above it says it: the
 * Flow is not confirmed, never that it "was not judged" -- run
 * `run-murwd8le-79e735a8` showed "not judged to do what you asked" under a card
 * that said the result was unverified (UI review D3). A long reason is cut at
 * the end of a sentence where one ends inside the bound.
 */
export function automationStudioFlowBootstrapRepairingJudgedSaid(judge: NonNullable<AutomationStudioFlowBootstrapJudgement["judge"]>): string {
  const carried = judge.untestedCarried ?? [];
  if (carried.length) return `The Flow was not judged to do what you asked: steps ${carried.join(", ")} came from the earlier Flow and were not run when it was tested. Repairing the Flow live, running them again.`;
  const said = boundedReason((judge.observed ?? judge.findings[0] ?? "").replace(/\s+/gu, " ").trim());
  if (judge.verdict !== "no") return `The Flow is not yet confirmed to do what you asked${said ? `: ${said}` : ""}. Repairing it live, to test it from its start and check it again.`;
  return `The Flow was tested from its start and judged not to do what you asked${said ? `: ${said}` : ""}. Repairing it live.`;
}

/** A reason of at most 160 characters, cut after its last whole sentence that fits, else mid-way; never ending in a full stop the heading adds. */
function boundedReason(reason: string): string {
  if (reason.length <= MAX_REASON) return reason.replace(/\.$/u, "");
  const sentence = /^.*[.!?](?=\s)/u.exec(reason.slice(0, MAX_REASON + 1))?.[0];
  return sentence ? sentence.replace(/\.$/u, "") : `${reason.slice(0, MAX_REASON - 3).trimEnd()}...`;
}

/**
 * How much of what was asked the Flow does, as an ending says it: results, not
 * claims. A checklist item is done when a step is named for it, and runs 36 and
 * 38 (t193, bigbox) ended "6 of the 6 things you asked are done" and "5 of the
 * 6" with nothing in the cart but what one step had really added: the claims
 * stood on steps that typed into a search field. So "worked" is said only of a
 * step that worked when the Flow was run from its start
 * (`AutomationStudioFlowBootstrapJudgement.proven`), and the rest is said as a
 * step not yet shown to work. Empty when the instruction asked for no act.
 *
 * **"Worked" needs the judge's yes (t193 R2-C3).** A proven step is one that
 * replayed or, since verify-only steps (`../../flow-draft/verify-only.ts`), one
 * the test only checked could run; and live run `run-murzln6g-11debe1d` said
 * "5 of the 6 things you asked worked" straight before "what it did was judged
 * not to be what you asked". So without a judged yes a proven step is said as
 * one that ran, or could run, and a judged no or an unjudged Flow is said with
 * it.
 * One thing asked is said as one thing (t195-w37): live run
 * `run-murz83zy-5030820f` read "1 of the 1 things you asked worked".
 */
export function automationStudioFlowBootstrapProgressSaid(
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined,
  judgement: (Pick<AutomationStudioFlowBootstrapJudgement, "tested" | "proven"> & { judge?: { verdict: "yes" | AutomationStudioFlowBootstrapJudgedWrong["verdict"] } | undefined }) | undefined
): string {
  const asked = (checklist ?? []).reduce((total, item) => total + 1 + (item.choices?.length ?? 0), 0);
  if (!asked) return "";
  const notDone = automationStudioFlowBootstrapNotDone(checklist);
  const named = Math.max(0, asked - notDone.length);
  const still = notDone.length ? `; still to do: ${automationStudioFlowBootstrapNotDoneSaid(notDone)}` : "";
  if (!named) return `${asked === 1 ? "The one thing you asked is not done" : `None of the ${asked} things you asked is done`}${still}.`;
  const verdict = judgement?.judge?.verdict;
  const judged = verdict === "no" ? ", but the Flow was judged not to do what you asked" : verdict && verdict !== "yes" ? ", but the Flow was not judged to do what you asked" : "";
  if (asked === 1) {
    // Named, so done: the one thing has a step, which worked when run (by the judge's yes), ran without one, did not, or was never run.
    if (!judgement || judgement.tested === "not_tested") return "The one thing you asked has a step in the Flow, not yet shown to work by running it.";
    if ((judgement.proven ?? 0) === 0) return "The one thing you asked has a step that did not work when the Flow was run from its start.";
    return verdict === "yes"
      ? "The one thing you asked worked when the Flow was run from its start."
      : `The one thing you asked has a step that ran, or could run, when the Flow was run from its start${judged}.`;
  }
  const have = (count: number): string => (count === 1 ? "has" : "have");
  if (!judgement || judgement.tested === "not_tested") return `${named} of the ${asked} things you asked ${have(named)} a step in the Flow, not yet shown to work by running it${still}.`;
  const proven = Math.min(named, judgement.proven ?? 0);
  const rest = named > proven ? `, and ${named - proven} more ${have(named - proven)} a step that did not work in that run` : "";
  if (verdict === "yes") return `${proven} of the ${asked} things you asked worked when the Flow was run from its start${rest}${still}.`;
  return `${proven} of the ${asked} things you asked ${have(proven)} a step that ran, or could run, when the Flow was run from its start${rest}${judged}${still}.`;
}

/**
 * Why a round stopped, as a clause. A round that stopped on decisions it could
 * not use says which kind they were, from the issues they were refused for,
 * when those are known (`BLOCKED_WORDS`).
 */
export function automationStudioFlowBootstrapStopSaid(stopped: AutomationStudioFlowBootstrapUnfinishedStop | "budget", issueCodes: readonly string[] = []): string {
  if (stopped === "budget") return "a budget ran out";
  const blocked = stopped === "unusable_decisions" ? automationStudioFlowBootstrapBlockedSaid(issueCodes) : "";
  return blocked ? `${STOP_WORDS[stopped]}, because ${blocked}` : STOP_WORDS[stopped];
}

function bounded(text: string, most: number): string {
  const folded = text.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  return folded.length > most ? `${folded.slice(0, most - 3).trimEnd()}...` : folded;
}
