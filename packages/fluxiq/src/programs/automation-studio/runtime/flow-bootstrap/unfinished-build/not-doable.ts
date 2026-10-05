// "Not doable": the explicit ending, with its reason, of a build that has no
// route left to what was asked.
//
// **Only if there is absolutely no way (user, 2026-09-30).** It is reached
// only when the judge of a tested Flow says what was asked can no longer be
// had (`stillAchievable: "no"`, `./phases.ts`). A budget that ran out first is
// never this ending (`./budget-exhausted.ts`), and since t195-w37 neither is a
// repair that got no further: live run `run-murwcaj0-40e56557` ended "I could
// not build this Flow, and I found no way to" after one repair the judge had
// called still achievable, naming the fix. Such a build ends not finished,
// with the Flow kept and what is left to change (`./not-finished.ts`).
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
//
// **Never cut inside a sentence (t193 round 1003).** The message was sliced to
// the ending's limit, so a long still-to-do list could cut the sentence that
// says what was tried. It is now fitted (`./ending-fit.ts`): the list and the
// judge's words are said with less room until it fits, and what was tried is
// always whole.
//
// **What was tried is said as a person reads it (t195-w48).** It used to read
// "I tried 3 times live -- exploring, then 2 repairs ... -- over 38 decisions,
// and the last repair handed back the same Flow"; the counts stay in the
// ending's `tried`, and the sentence is the not-finished ending's
// (`automationStudioFlowBootstrapWorkedLiveSaid`). An unsure judge's closing
// words are a build's, never "the run is not marked as failed for it"
// (`automationStudioFlowBootstrapUnsettledForBuild`; t193 round 1003, D10).
import type { AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapNoRouteLeft } from "./contracts.ts";
import {
  automationStudioFlowBootstrapNotDone,
  automationStudioFlowBootstrapNotDoneSaid,
  automationStudioFlowBootstrapStopSaid,
  automationStudioFlowBootstrapTestSaid,
  automationStudioFlowBootstrapUnsettledForBuild,
  automationStudioFlowBootstrapWorkedLiveSaid
} from "./not-done.ts";
import { automationStudioFlowBootstrapEndingFitted, type AutomationStudioFlowBootstrapEndingRoom } from "./ending-fit.ts";
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
  /** Why no route is left (`./phases.ts`): the judge said it can no longer be had. Absent: the older "got no further". */
  noRoute?: AutomationStudioFlowBootstrapNoRouteLeft | undefined;
}): AutomationStudioFlowBootstrapBuildEnding {
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const asked = (input.checklist ?? []).reduce((total, item) => total + 1 + (item.choices?.length ?? 0), 0);
  // One thing asked is a thing, not "1 of the 1 things" (live run `run-murz83zy-5030820f`).
  const share = asked === 1 ? "the one thing you asked" : `${notDone.length} of the ${asked} things you asked`;
  const judge = input.judgement.judge;
  const what = (room: AutomationStudioFlowBootstrapEndingRoom): string => {
    const checklistSaid = notDone.length ? `${share} could not be done: ${automationStudioFlowBootstrapNotDoneSaid(notDone, room)}.` : "";
    return judge
      ? [judgedSaid(judge, room.judge), checklistSaid].filter(Boolean).join(" ")
      : checklistSaid || `the Flow could not be finished: ${automationStudioFlowBootstrapStopSaid(input.judgement.stopped, input.judgement.lastIssueCodes)}.`;
  };
  const repairs = input.rounds - 1;
  const last = input.noRoute ? noRouteSaid(input.noRoute) : judge ? "came out with the same Flow as the one before it" : "got no further than the one before it";
  const tried = `${automationStudioFlowBootstrapWorkedLiveSaid(input.rounds)}, and the last attempt${repairs ? " to fix it" : ""} ${last}.`;
  // The judge's account already says the Flow was tested and not judged to do it, so the test's own sentence is
  // said only where it says more: steps carried from the Flow being changed and never run in this build (t193
  // round 1003: the same point never said twice).
  const testSaid = judge && !(input.judgement.notRunInThisBuild?.length && !judge.untestedCarried?.length) ? "" : automationStudioFlowBootstrapTestSaid(input.judgement);
  // What was tried closes it, always whole.
  const message = automationStudioFlowBootstrapEndingFitted((room) => ({
    body: [`I could not build this Flow, and I found no way to: ${what(room)}`, testSaid],
    close: [tried]
  }));
  return {
    kind: "not_doable",
    message,
    notDone,
    tried: automationStudioFlowBootstrapTried(input)
  };
}

/** The last attempt's account of why no route is left. */
function noRouteSaid(noRoute: AutomationStudioFlowBootstrapNoRouteLeft): string {
  switch (noRoute.kind) {
    case "judged_unachievable": return "ended when the judge found that what you asked can no longer be done";
  }
}

/** What the judge found, in the person's terms: what they asked, and what the test did. Its words are the judge's own, already screened. */
function judgedSaid(judge: AutomationStudioFlowBootstrapJudgedWrong, most: number): string {
  // Not judged to do it, for any reason (t244): an unsure judge, one that could
  // not answer, or a yes about another version or no test. Steps carried from
  // an earlier Flow and never run are one such reason, named when they are it.
  if (judge.verdict !== "no") {
    if (judge.untestedCarried?.length) return "the steps it carried from the earlier Flow were never run in this build, so it could not be judged to do what you asked.";
    const why = automationStudioFlowBootstrapUnsettledForBuild(judge.findings[0] ?? "");
    return `it was never judged to do what you asked${why ? ` -- "${bounded(why, most)}"` : ""}.`;
  }
  const told = [
    judge.expected ? `what you asked: "${bounded(judge.expected, most)}"` : "",
    judge.observed ? `what its test did: "${bounded(judge.observed, most)}"` : "",
    !judge.expected && !judge.observed && judge.findings[0] ? `"${bounded(judge.findings[0], most)}"` : ""
  ].filter(Boolean);
  return `it was tested from its start and judged not to do what you asked${told.length ? ` -- ${told.join("; ")}` : ""}.`;
}

/** The judge's words, folded to one line, at most `most` characters. */
function bounded(text: string, most: number): string {
  const folded = text.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  return folded.length > most ? `${folded.slice(0, most - 3).trimEnd()}...` : folded;
}
