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
// **What stood still is said, never a bare "got no further" (t240).** Repairs
// are bounded by money and progress (`./progress.ts`), so the ending names the
// measures that did not move -- the same Flow, no more of the request with a
// step, no more steps that worked, the judge's same findings -- or that the
// round ended on refused repeats and handed back the Flow it started from
// (run 38, cause C8).
//
// **After a judge, its account comes first (t195).** A Flow the model said was
// ready, tested and judged wrong, and a repair that handed back the same Flow:
// the person is told what the judge found -- what they asked and what the
// test did -- then the checklist's own reading, as before.
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE, type AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapNoRouteLeft } from "./contracts.ts";
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapNotDoneSaid, automationStudioFlowBootstrapStopSaid, automationStudioFlowBootstrapTestSaid } from "./not-done.ts";
import { automationStudioFlowBootstrapTried } from "./tried.ts";

/** The not-doable ending, from the last judgement and the checklist it was read by. */
export function automationStudioFlowBootstrapNotDoable(input: {
  judgement: AutomationStudioFlowBootstrapJudgement;
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined;
  /** Live rounds: the exploration, then each repair. */
  rounds: number;
  /** Decisions across every round. */
  decisions: number;
  /** Why each live round stopped, in order (`./tried.ts`). */
  stops?: AutomationStudioFlowBootstrapBuildEnding["tried"]["stops"] | undefined;
  /** Why no route is left (`./phases.ts`): said as the last round's account. Absent: the older "got no further". */
  noRoute?: AutomationStudioFlowBootstrapNoRouteLeft | undefined;
}): AutomationStudioFlowBootstrapBuildEnding {
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const asked = (input.checklist ?? []).reduce((total, item) => total + 1 + (item.choices?.length ?? 0), 0);
  const checklistSaid = notDone.length ? `${notDone.length} of the ${asked} things you asked could not be done: ${automationStudioFlowBootstrapNotDoneSaid(notDone)}.` : "";
  const judge = input.judgement.judge;
  const what = judge
    ? [judgedSaid(judge), checklistSaid].filter(Boolean).join(" ")
    : checklistSaid || `the Flow could not be finished: ${automationStudioFlowBootstrapStopSaid(input.judgement.stopped, input.judgement.lastIssueCodes)}.`;
  const repairs = input.rounds - 1;
  const last = input.noRoute ? noRouteSaid(input.noRoute, input.judgement, asked) : judge ? "handed back the same Flow as the one before it" : "got no further than the one before it";
  const tried = `I tried ${input.rounds === 1 ? "once" : `${input.rounds} times`} live -- exploring${repairs ? `, then ${repairs === 1 ? "one repair" : `${repairs} repairs`} after testing what I had` : ""} -- over ${input.decisions} decisions, and the last ${repairs ? "repair" : "attempt"} ${last}.`;
  const message = [`I could not build this Flow, and I found no way to: ${what}`, automationStudioFlowBootstrapTestSaid(input.judgement), tried]
    .filter(Boolean)
    .join(" ");
  return {
    kind: "not_doable",
    message: message.slice(0, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE),
    notDone,
    tried: automationStudioFlowBootstrapTried(input)
  };
}

/** The last round's account of why no route is left: what it did, and what stood still against the round before it. */
function noRouteSaid(noRoute: AutomationStudioFlowBootstrapNoRouteLeft, after: AutomationStudioFlowBootstrapJudgement, asked: number): string {
  if (noRoute.kind === "repeated_unchanged") return "ended on refused repeats of the same calls and handed back the Flow it started from, unchanged, so another round would only repeat it";
  const before = noRoute.before;
  const still: string[] = [];
  if (after.flowSignature !== undefined && after.flowSignature === before.flowSignature) still.push("it handed back the same Flow");
  if (asked) {
    // One thing asked is a thing, not "the 1 things" (`run-murdouox-c5294247`).
    const things = `${asked} thing${asked === 1 ? "" : "s"}`;
    still.push(after.done < before.done
      ? `fewer of the ${things} you asked had a step (${after.done}, down from ${before.done})`
      : `no more of the ${things} you asked had a step (${after.done}, as before)`);
  }
  if (before.judge && after.judge) {
    still.push(after.judge.verdict === "no" ? (before.judge.verdict === "no" ? "the judge found the same as before" : "the judge still found it wrong") : "the judge still could not judge it");
  } else if (before.judge) still.push("it stopped before it was ready, where the round before it had finished");
  else if (after.tested === "not_tested") still.push("it could not be run from its start");
  else if (after.tested === "replay_failed") {
    const failed = after.failedSteps.length;
    still.push(failed ? `its test still failed at ${failed} step${failed === 1 ? "" : "s"}` : "its test still failed");
  }
  else still.push("no more of its steps worked when it was run from its start");
  return `made no measurable progress on the round before it: ${still.join("; ")}`;
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
