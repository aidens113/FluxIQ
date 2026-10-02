// "Not doable": the explicit ending, with its reason, of a build that has no
// route left to what was asked.
//
// **Only if there is absolutely no way (user, 2026-09-30).** It is reached
// only after the Flow was tested and judged and a repair then got no further
// than the judgement before it (`./phases.ts`): the model worked live on
// exactly what was missing or failing, with the checklist in front of it, and
// nothing it did advanced. A budget that ran out first is never this ending
// (`./budget-exhausted.ts`).
//
// **The reason is the evidence the model saw**: the checklist's reason for
// each act or choice still to do, what the test found when the Flow was run
// from its start, and why each round stopped -- said in plain words, with the
// person's own words for what they asked, never a code.
//
// **After a judge, its account comes first (t195).** A Flow the model said was
// ready, tested and judged wrong, and a repair that handed back the same Flow:
// the person is told what the judge found -- what they asked and what the
// test did -- then the checklist's own reading, as before.
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE, type AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement } from "./contracts.ts";
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapNotDoneSaid, automationStudioFlowBootstrapStopSaid, automationStudioFlowBootstrapTestSaid } from "./not-done.ts";

/** The not-doable ending, from the last judgement and the checklist it was read by. */
export function automationStudioFlowBootstrapNotDoable(input: {
  judgement: AutomationStudioFlowBootstrapJudgement;
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined;
  /** Live rounds: the exploration, then each repair. */
  rounds: number;
  /** Decisions across every round. */
  decisions: number;
}): AutomationStudioFlowBootstrapBuildEnding {
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const asked = (input.checklist ?? []).reduce((total, item) => total + 1 + (item.choices?.length ?? 0), 0);
  const checklistSaid = notDone.length ? `${notDone.length} of the ${asked} things you asked could not be done: ${automationStudioFlowBootstrapNotDoneSaid(notDone)}.` : "";
  const judge = input.judgement.judge;
  const what = judge
    ? [judgedSaid(judge), checklistSaid].filter(Boolean).join(" ")
    : checklistSaid || `the Flow could not be finished: ${automationStudioFlowBootstrapStopSaid(input.judgement.stopped)}.`;
  const repairs = input.rounds - 1;
  const last = judge ? "handed back the same Flow as the one before it" : "got no further than the one before it";
  const tried = `I tried ${input.rounds === 1 ? "once" : `${input.rounds} times`} live -- exploring${repairs ? `, then ${repairs === 1 ? "one repair" : `${repairs} repairs`} after testing what I had` : ""} -- over ${input.decisions} decisions, and the last ${repairs ? "repair" : "attempt"} ${last}.`;
  const message = [`I could not build this Flow, and I found no way to: ${what}`, automationStudioFlowBootstrapTestSaid(input.judgement), tried]
    .filter(Boolean)
    .join(" ");
  return {
    kind: "not_doable",
    message: message.slice(0, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE),
    notDone,
    tried: { rounds: input.rounds, decisions: input.decisions, stepsInFlow: input.judgement.stepsInFlow, tested: input.judgement.tested }
  };
}

const MAX_JUDGE_WORDS = 200;

/** What the judge found, in the person's terms: what they asked, and what the test did. Its words are the judge's own, already screened. */
function judgedSaid(judge: AutomationStudioFlowBootstrapJudgedWrong): string {
  if (judge.verdict !== "no") return "the steps it carried from the earlier Flow were never run in this build, so it could not be judged to do what you asked.";
  const told = [
    judge.expected ? `what you asked: "${bounded(judge.expected)}"` : "",
    judge.observed ? `what its test did: "${bounded(judge.observed)}"` : "",
    !judge.expected && !judge.observed && judge.findings[0] ? `"${bounded(judge.findings[0])}"` : ""
  ].filter(Boolean);
  return `it was tested from its start and judged not to do what you asked${told.length ? ` -- ${told.join("; ")}` : ""}.`;
}

function bounded(text: string): string {
  const folded = text.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  return folded.length > MAX_JUDGE_WORDS ? `${folded.slice(0, MAX_JUDGE_WORDS - 3).trimEnd()}...` : folded;
}
