// "Not finished": the ending of a build that stopped with a route still open.
//
// **Not "not doable" (t195-w37, cause R11).** Live run `run-murwcaj0-40e56557`:
// round 0's judge said no, still achievable, add a read after the confirm
// loop; round 1's judge said no, still achievable, with a different finding
// (the confirm acts on Tom Becker) and its fix. The build ended on t240's
// no-progress stop, and the person read "I could not build this Flow, and I
// found no way to ... the judge found the same as before", with $0.0106 of its
// $0.10 purse left. The user's rule is that a build ends "not doable" only if
// there is absolutely no way, with the reason; a round that got no further is
// not that. So the no-progress stop and the refused-repeats stop (run 38,
// cause C8) end here (`./phases.ts`): the Flow so far kept, the honest reason
// -- what stood still -- and what the judge said is left to change.
//
// **What stood still is said, never a bare "got no further" (t240)**: the
// measures that did not move -- the same Flow, no more of the request with a
// step, no more steps that worked -- and the judge's account. "The judge found
// the same as before" only when its finding codes and its advice are both
// unchanged; otherwise what it found this time, in its own screened words.
//
// **Said as a chat answer, not a debug log (t195-w48).** Runs
// `run-musr9pv3-f4bf6256` and `run-musp474o-e0ed7432` read "the last repair made
// no measurable progress on the round before it ... (1, as before) ... over 73
// decisions". The person reads plain sentences; the counts a debug needs stay
// in the ending's `tried` (rounds, decisions, stops, `noRoute.kind`).
//
// **Each pair of judgements is said as what it was (t193 round 1003).** Live
// run `run-musp4h2f-72e8ed99` was judged `no` twice, then `no` and `yes`, and
// read "the judge still could not judge it": the attempt before had been
// judged, wrong. After a `no`, an unsure judge is said as what it was: one of
// its checks now said the Flow does what was asked, or it could not tell this
// time; "still could not tell" only when it could not tell the time before
// either.
//
// **Said once, with the judge's doubt (t193 round 1003, D10).** The same run
// said "not judged to do what you asked" twice, in the progress sentence and
// the test's (`automationStudioFlowBootstrapProgressAndTestSaid`), and never
// said what the judge doubted: one check found the towel quantity of two
// unproven, the other did not confirm it (`unconfirmedReading`). The doubt is
// now said, bounded, where a `no`'s advice is.
//
// **Never cut inside a sentence (t193 round 1003).** Live run
// `run-mustzxhi-2e2cda87` read "The Flow so far was kept as a draft, not put
// into the.": the message was sliced to the ending's limit. It is now fitted
// (`./ending-fit.ts`): the still-to-do list and the judge's words are said with
// less room until it fits, and what was tried and the kept sentence are always
// whole.
import type { AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapJudgeReading, AutomationStudioFlowBootstrapStoodStill } from "./contracts.ts";
import { automationStudioFlowBootstrapEndingFitted } from "./ending-fit.ts";
import { automationStudioFlowBootstrapKeptSaid } from "./kept-said.ts";
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapProgressAndTestSaid, automationStudioFlowBootstrapWorkedLiveSaid } from "./not-done.ts";
import { automationStudioFlowBootstrapTried } from "./tried.ts";

/** The not-finished ending, from the last judgement, the checklist it was read by, and what stood still. */
export function automationStudioFlowBootstrapNotFinished(input: {
  judgement: AutomationStudioFlowBootstrapJudgement;
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined;
  /** Live rounds: the exploration, then each repair. */
  rounds: number;
  /** Decisions across every round. */
  decisions: number;
  /** Why each live round stopped, in order (`./tried.ts`). */
  stops?: AutomationStudioFlowBootstrapBuildEnding["tried"]["stops"] | undefined;
  stoodStill: AutomationStudioFlowBootstrapStoodStill;
  /** Whether the Flow so far was kept for the next build. */
  kept: boolean;
}): AutomationStudioFlowBootstrapBuildEnding {
  const asked = (input.checklist ?? []).reduce((total, item) => total + 1 + (item.choices?.length ?? 0), 0);
  const repairs = input.rounds - 1;
  const judge = input.judgement.judge;
  // What stood still and what is left are said first; what was tried and what was kept close it, always whole.
  const message = automationStudioFlowBootstrapEndingFitted((room) => ({
    body: [
      `I have not finished this Flow yet. ${stoodStillSaid(input.stoodStill, input.judgement, asked, repairs, room.judge)}.`,
      judge?.verdict === "no" ? (judge.advice ? `What the judge says is left to change: "${bounded(judge.advice, room.judge)}".` : "") : doubtSaid(judge?.unconfirmedReading, room.judge),
      automationStudioFlowBootstrapProgressAndTestSaid(input.checklist, input.judgement, room)
    ],
    close: [`${automationStudioFlowBootstrapWorkedLiveSaid(input.rounds)}.`, automationStudioFlowBootstrapKeptSaid(input.kept)]
  }));
  return {
    kind: "not_finished",
    message,
    notDone: automationStudioFlowBootstrapNotDone(input.checklist),
    tried: automationStudioFlowBootstrapTried({ ...input, noRoute: { kind: input.stoodStill.kind } })
  };
}

/** Why the build stopped, as sentences: what the last attempt, or attempts, did not move against the one before. */
function stoodStillSaid(stoodStill: AutomationStudioFlowBootstrapStoodStill, after: AutomationStudioFlowBootstrapJudgement, asked: number, repairs: number, most: number): string {
  if (stoodStill.kind === "repeated_unchanged") {
    return `${repairs ? "My last attempt to fix it" : "My first attempt"} kept retrying the same things, which had already failed or done nothing, and left the Flow just as it started, so trying again would only do the same`;
  }
  const { before, rounds } = stoodStill;
  const still: string[] = [];
  if (after.flowSignature !== undefined && after.flowSignature === before.flowSignature) still.push("the Flow came out exactly the same");
  if (asked) still.push(stepsAskedSaid(asked, before.done, after.done));
  if (before.judge && after.judge) still.push(judgeSaid(before.judge, after.judge, most));
  else if (before.judge) still.push("it stopped before the Flow was ready, though the attempt before it had got that far");
  else if (after.tested === "not_tested") still.push("it could not be run from the start");
  else if (after.tested === "replay_failed") {
    const failed = after.failedSteps.length;
    still.push(failed ? `it still failed at ${failed === 1 ? "a step" : `${failed} steps`} when tested` : "it still failed when tested");
  } else still.push("no more of its steps worked when it was run from the start");
  const opening = rounds > 1 ? `My last ${rounds} attempts to fix it each got no further than the one before` : "My last attempt to fix it got no further than the one before";
  return `${opening}: ${listSaid(still)}`;
}

/** How many of the things asked have a step, against the attempt before. One thing asked is a thing, never "the 1 things" (`run-murdouox-c5294247`). */
function stepsAskedSaid(asked: number, before: number, after: number): string {
  if (asked === 1) {
    if (after < before) return "the one thing you asked no longer has a step";
    return after ? "the one thing you asked has a step as it did before" : "the one thing you asked still has no step";
  }
  if (after < before) return `only ${after} of the ${asked} things you asked have a step now, down from ${before}`;
  return `${after} of the ${asked} things you asked ${after === 1 ? "has" : "have"} a step, no more than before`;
}

/** "a", "a, and b", "a, b, and c": each part is a clause of its own. */
function listSaid(parts: readonly string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}` : parts[0] ?? "";
}

/**
 * The judge's doubt, when it was unsure: the reading of its one check that
 * found the Flow wrong, which the other did not confirm -- what that check saw,
 * else what it said to change -- bounded, and said as a doubt, never as a
 * finding. Empty when there is none.
 */
function doubtSaid(reading: AutomationStudioFlowBootstrapJudgeReading | undefined, most: number): string {
  const observed = folded(reading?.observed ?? "");
  if (observed) return `What the judge doubted, in one check the other did not confirm: "${bounded(observed, most)}".`;
  const advice = folded(reading?.advice ?? "");
  return advice ? `What one check of the judge says is left to change, which the other did not confirm: "${bounded(advice, most)}".` : "";
}

/**
 * The judge's account against the one before: the same only when its finding
 * codes and its advice are both unchanged. An unsure judge after a `no` is said
 * as what that pair was (t193 round 1003), in a person's words (t195-w48).
 */
function judgeSaid(before: AutomationStudioFlowBootstrapJudgedWrong, after: AutomationStudioFlowBootstrapJudgedWrong, most: number): string {
  if (after.verdict !== "no") {
    if (before.verdict !== "no") return "the judge still could not tell whether it does what you asked";
    return after.oneCallSaidYes
      ? "the judge no longer agreed it was wrong, as one of its two checks said it does what you asked"
      : "the judge could not tell this time whether it does what you asked, though it had found the attempt before wrong";
  }
  if (before.verdict !== "no") return "the judge now found it does not do what you asked";
  if (sameFindings(before, after)) return "the judge found the same as before";
  const found = after.observed ?? after.findings[0];
  return found ? `this time the judge found: "${bounded(found, most)}"` : "the judge found something else this time";
}

function sameFindings(before: AutomationStudioFlowBootstrapJudgedWrong, after: AutomationStudioFlowBootstrapJudgedWrong): boolean {
  const codes = (judge: AutomationStudioFlowBootstrapJudgedWrong): string => [...new Set(judge.findings)].sort().join("\n");
  return codes(before) === codes(after) && folded(before.advice ?? "") === folded(after.advice ?? "");
}

function folded(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
}

/** The judge's words, folded to one line, at most `most` characters. */
function bounded(text: string, most: number): string {
  const said = folded(text);
  return said.length > most ? `${said.slice(0, most - 3).trimEnd()}...` : said;
}
