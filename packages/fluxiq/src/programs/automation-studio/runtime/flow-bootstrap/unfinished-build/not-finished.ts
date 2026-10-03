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
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE, type AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapStoodStill } from "./contracts.ts";
import { automationStudioFlowBootstrapKeptSaid } from "./kept-said.ts";
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapProgressSaid, automationStudioFlowBootstrapTestSaid } from "./not-done.ts";
import { automationStudioFlowBootstrapTried } from "./tried.ts";

const MAX_JUDGE_WORDS = 200;

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
  const left = judge?.verdict === "no" && judge.advice ? `What the judge says is left to change: "${bounded(judge.advice)}".` : "";
  const tried = `I tried ${input.rounds === 1 ? "once" : `${input.rounds} times`} live -- exploring${repairs ? `, then ${repairs === 1 ? "one repair" : `${repairs} repairs`} after testing what I had` : ""} -- over ${input.decisions} decisions.`;
  const message = [
    `I have not finished this Flow yet: ${stoodStillSaid(input.stoodStill, input.judgement, asked, repairs)}.`,
    left,
    automationStudioFlowBootstrapProgressSaid(input.checklist, input.judgement),
    automationStudioFlowBootstrapTestSaid(input.judgement),
    tried,
    automationStudioFlowBootstrapKeptSaid(input.kept)
  ].filter(Boolean).join(" ");
  return {
    kind: "not_finished",
    message: message.slice(0, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE),
    notDone: automationStudioFlowBootstrapNotDone(input.checklist),
    tried: automationStudioFlowBootstrapTried({ ...input, noRoute: { kind: input.stoodStill.kind } })
  };
}

/** Why the build stopped: what the last round, or rounds, did not move against the round before. */
function stoodStillSaid(stoodStill: AutomationStudioFlowBootstrapStoodStill, after: AutomationStudioFlowBootstrapJudgement, asked: number, repairs: number): string {
  if (stoodStill.kind === "repeated_unchanged") {
    return `the last ${repairs ? "repair" : "attempt"} ended on refused repeats of the same calls and handed back the Flow it started from, unchanged, so another round would only repeat it`;
  }
  const { before, rounds } = stoodStill;
  const still: string[] = [];
  if (after.flowSignature !== undefined && after.flowSignature === before.flowSignature) still.push("it handed back the same Flow");
  if (asked) {
    // One thing asked is a thing, not "the 1 things" (`run-murdouox-c5294247`).
    const things = `${asked} thing${asked === 1 ? "" : "s"}`;
    still.push(after.done < before.done
      ? `fewer of the ${things} you asked had a step (${after.done}, down from ${before.done})`
      : `no more of the ${things} you asked had a step (${after.done}, as before)`);
  }
  if (before.judge && after.judge) still.push(judgeSaid(before.judge, after.judge));
  else if (before.judge) still.push("it stopped before it was ready, where the round before it had finished");
  else if (after.tested === "not_tested") still.push("it could not be run from its start");
  else if (after.tested === "replay_failed") {
    const failed = after.failedSteps.length;
    still.push(failed ? `its test still failed at ${failed} step${failed === 1 ? "" : "s"}` : "its test still failed");
  } else still.push("no more of its steps worked when it was run from its start");
  const opening = rounds > 1 ? `the last ${rounds} repairs made no measurable progress, each on the round before it` : "the last repair made no measurable progress on the round before it";
  return `${opening}: ${still.join("; ")}`;
}

/** The judge's account against the one before: the same only when its finding codes and its advice are both unchanged. */
function judgeSaid(before: AutomationStudioFlowBootstrapJudgedWrong, after: AutomationStudioFlowBootstrapJudgedWrong): string {
  if (after.verdict !== "no") return "the judge still could not judge it";
  if (before.verdict !== "no") return "the judge still found it wrong";
  if (sameFindings(before, after)) return "the judge found the same as before";
  const found = after.observed ?? after.findings[0];
  return found ? `this time the judge found: "${bounded(found)}"` : "the judge found something else this time";
}

function sameFindings(before: AutomationStudioFlowBootstrapJudgedWrong, after: AutomationStudioFlowBootstrapJudgedWrong): boolean {
  const codes = (judge: AutomationStudioFlowBootstrapJudgedWrong): string => [...new Set(judge.findings)].sort().join("\n");
  return codes(before) === codes(after) && folded(before.advice ?? "") === folded(after.advice ?? "");
}

function folded(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function bounded(text: string): string {
  const said = folded(text);
  return said.length > MAX_JUDGE_WORDS ? `${said.slice(0, MAX_JUDGE_WORDS - 3).trimEnd()}...` : said;
}
