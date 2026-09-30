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
  step_only_arrives: "the step I tried for it only opened the starting page",
  step_is_optional: "the step for it may be skipped, so it might never happen",
  act_needs_repeat: "it has to be done for every item, and I found no way to repeat it over them",
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

/** What the last test found, as a sentence. */
export function automationStudioFlowBootstrapTestSaid(judgement: AutomationStudioFlowBootstrapJudgement | undefined): string {
  if (!judgement || judgement.tested === "not_tested") return judgement && judgement.stepsInFlow === 0 ? "No step I found belonged in the Flow." : "";
  const steps = `${judgement.stepsInFlow} step${judgement.stepsInFlow === 1 ? "" : "s"}`;
  if (judgement.tested === "replayed_clean") return `The Flow as far as it got (${steps}) ran from its start without failing.`;
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
