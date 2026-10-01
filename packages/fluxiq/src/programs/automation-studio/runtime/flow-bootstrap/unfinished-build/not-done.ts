// What of the person's request a Flow does not do yet, as an ending carries it
// and as the person reads it.
//
// Both come from the checklist (`../instructed-acts/checklist.ts`): the ids
// and the person's own words for each act and choice still to do, and the
// checklist's reason put into a plain clause. Nothing here is page content.
import type { AutomationStudioInstructedActChecklistItem, AutomationStudioInstructedActTodo } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapUnfinishedStop } from "./contracts.ts";

const MAX_QUOTE = 200;
const MAX_SAID_QUOTE = 90;
const MAX_SAID = 4;

/** Each reason, as a clause that finishes "... : <quote> -- ". */
const TODO_WORDS: Readonly<Record<AutomationStudioInstructedActTodo, string>> = Object.freeze({
  no_step_added: "nothing I tried did it",
  step_not_kept: "the step I tried for it is not in the Flow",
  step_changed_nothing: "the step I tried for it changed nothing",
  step_only_reads: "the step I named for it only read the page, and did not do it",
  step_only_arrives: "the step I tried for it only opened the starting page",
  step_is_optional: "the step for it may be skipped, so it might never happen",
  act_needs_repeat: "it has to be done for every item, and I found no way to repeat it over them",
  span_stops_short: "part of it ran once after the loop instead of on every item",
  act_consequence_undeclared: "the step for it did not say it needs your permission, so you were never asked",
  choice_is_the_act_step: "the step that adds the item does not set it",
  step_claimed_twice: "the step I tried for it already does something else"
});

/** Why each round stopped, as a clause that finishes "The build stopped because ...". */
const STOP_WORDS: Readonly<Record<AutomationStudioFlowBootstrapUnfinishedStop, string>> = Object.freeze({
  iterations: "it used every decision it had without the Flow being finished",
  tool_calls: "it used every action it had without the Flow being finished",
  unusable_decisions: "every attempt to finish was refused",
  repeat_without_progress: "it kept repeating itself without getting further"
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
  const said = notDone.slice(0, MAX_SAID).map((item) => `"${bounded(item.quote, MAX_SAID_QUOTE)}": ${TODO_WORDS[item.todo as AutomationStudioInstructedActTodo] ?? "nothing I tried did it"}`);
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

/** Why a round stopped, as a clause. */
export function automationStudioFlowBootstrapStopSaid(stopped: AutomationStudioFlowBootstrapUnfinishedStop | "budget"): string {
  return stopped === "budget" ? "a budget ran out" : STOP_WORDS[stopped];
}

function bounded(text: string, most: number): string {
  const folded = text.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  return folded.length > most ? `${folded.slice(0, most - 3).trimEnd()}...` : folded;
}
