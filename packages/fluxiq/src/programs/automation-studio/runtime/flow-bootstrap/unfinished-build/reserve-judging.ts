// A round that stopped before its Flow was judged: the Flow as it stands is put
// to the build's judge before the build ends, never left with money unspent on
// judging it (user, t254 stage 2, decision 4; t254's aim, t195-w42).
//
// **What was wrong: a round the judging reserve stopped.** From a build's start its purse keeps a judging pair back
// from every call that is not a judge's (`./round-funding.ts`,
// `../../llm/build-purse/purse.ts`), so a round's judging is always paid for.
// A round whose next decision would have eaten into that reserve was refused
// the decision and ended as any cost stop does: the build ended
// `budget_exhausted` with the reserve unspent and the Flow so far never judged.
// Live run murzln6g's repair at peak rates was refused its first decision
// beside $0.0068 kept back, and ended with its draft untested.
//
// **What was wrong: a round that stopped short (t195-w42).** Live run
// `run-musp474o-e0ed7432`: round 1 finished and was judged no, still
// achievable, with the fix named (widen the listing's where so Jonas Weber is
// kept). Round 2 applied exactly that, then stopped on refused repeats without
// saying the Flow was ready. Its Flow -- a different one -- was tested whole and
// ran clean, but was judged from the checklist alone: no progress was found
// against round 1's judged judgement and the build ended `not_finished`, about
// $0.05 of its $0.10 purse unspent and that Flow never judged.
//
// **What happens now.** A round the reserve stopped -- a cost refusal with
// `keptBackUsd`, or a call refusal with `keptBackCalls` (t262) -- and a round
// that stopped short each have their Flow tested from its start
// (`./judgement.ts`), with the test handed to the judge, and a clean test is
// put to the build's judge, whose calls draw on the judging reserve. A yes
// about that very Flow (its `flowSignature`, the rule of 2026-10-02) finishes
// the build with it. Anything else is the round's judgement with the judge's
// account: a reserve-stopped round then ends the build at its budget with it
// (`./budget-exhausted.ts`) -- never "not doable", even on a judge's
// `stillAchievable: "no"`: money or calls stopped that build, not a judged dead
// end -- and a round that stopped short goes on to phase 3's rules unchanged
// (`./phases.ts`): a judge who says it can no longer be had ends it not
// doable, progress is measured against the judgement before, and a judge who
// named the fix buys one more round the purse can fund.
//
// Nothing is judged where there is nothing to judge: an empty Flow, one no
// replay can run, one whose test did not run clean (the judge reads a passing
// test), or one the caller cannot build as it stands (`accept`) -- a yes could
// finish none of them, so nothing is spent on one. Those go on as before, with
// what the test found. Which Flows are not judged again -- the one a judge of
// this build last said no to, unchanged -- is the caller's (`./phases.ts`).
//
// **Nor where the judging can no longer be paid for whole.** A judgement is a
// pair of calls, and a yes finishes the build only once the second confirms it
// (`../../result-verification/agreement.ts`). The purse keeps that pair back only
// from calls that are not a judge's, so a round can open with too little left
// for the pair itself. Live run `run-mux6nxst-c9bca37c` (D3-5) opened its next
// round with 47 of 48 calls spent; the reserve judgement got its first call,
// which said yes, the purse refused the confirming one, and that one
// unconfirmed yes finished the build. So where the build's purse cannot hold
// the whole judging now (`judgingFits`), nothing is started: neither `accept`
// nor the judge is asked, and a reserve-stopped round ends at its budget
// unjudged (`./phases.ts`).
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLlmCurrentBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapRoundProgress, AutomationStudioFlowBootstrapTestVerdict } from "./contracts.ts";
import { automationStudioFlowBootstrapWithJudgeAccount, automationStudioFlowBootstrapYesNotAboutThisFlow } from "./judgement.ts";

type FinishedLoop = Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }>;

/** What the Flow such a round left is said to be when it is built, by what stopped the round: it never had a completion of its own. */
const JUDGED_SUMMARY = {
  cost: "Flow built from the steps that ran before the build reached its spending limit.",
  calls: "Flow built from the steps that ran before the build reached its model call allowance.",
  short: "Flow built from the steps that ran before the build stopped short of finishing it."
} as const;

/** How judging the Flow a stopped round left went. */
export type AutomationStudioFlowBootstrapReserveJudging =
  /** Nothing was judged (see the module comment): the build goes on as it would have. */
  | { kind: "not_judged" }
  /** The build was cancelled while it was judged. */
  | { kind: "cancelled" }
  /** Judged yes about the Flow as it stands: the build's result, as a finished round's. */
  | { kind: "finished"; loop: FinishedLoop; verdict: Extract<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }> }
  /**
   * Judged, and not found to do what was asked: the judgement with the judge's
   * account, what judging cost, and the verdict as this Flow's (a yes about
   * another Flow is `not_judged` here).
   */
  | { kind: "judged"; judgement: AutomationStudioFlowBootstrapJudgement; judgingUsd: number; verdict: Exclude<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }> };

/**
 * Judges the Flow a round left when it stopped before its Flow was judged:
 * `stopped` says why -- the judging reserve, on money (`cost`) or on calls
 * (`calls`), or short of a completion (`short`). `judgement` and `seed` are
 * that round's tested judgement and the Flow it tested
 * (`automationStudioFlowBootstrapJudgeUnfinished`); `judge` is the build's,
 * with its spend already accounted by the caller.
 */
export async function automationStudioFlowBootstrapJudgeAtReserve(input: {
  stopped: keyof typeof JUDGED_SUMMARY;
  judgement: AutomationStudioFlowBootstrapJudgement;
  seed: AutomationStudioFlowDraftStep[];
  progress: AutomationStudioFlowBootstrapRoundProgress;
  /** Whether the caller can build the Flow as it stands, and makes it the plan it will build if the build finishes. Absent: it can. */
  accept?: ((loop: FinishedLoop) => Promise<boolean>) | undefined;
  judge(loop: FinishedLoop): Promise<AutomationStudioFlowBootstrapTestVerdict | "cancelled">;
}): Promise<AutomationStudioFlowBootstrapReserveJudging> {
  if (!input.judgement.stepsInFlow || input.judgement.tested !== "replayed_clean") return { kind: "not_judged" };
  // A judgement the purse cannot pay for whole is not started: one unconfirmed yes would finish the build (run-mux6nxst-c9bca37c).
  const purse = automationStudioLlmCurrentBuildPurse();
  if (purse && !purse.judgingFits()) return { kind: "not_judged" };
  // The round's own record, and the Flow as its test ran it: the judge's test report numbers steps as the seed does.
  const loop: FinishedLoop = { ok: true, result: { summary: JUDGED_SUMMARY[input.stopped] }, trace: [...input.progress.trace], steps: input.seed, accounting: { ...input.progress.accounting } };
  if (input.accept && !(await input.accept(loop))) return { kind: "not_judged" };
  const verdict = await input.judge(loop);
  if (verdict === "cancelled") return { kind: "cancelled" };
  if (verdict.verdict === "yes" && verdict.flowSignature === automationStudioFlowDraftFlowSignature(input.seed)) return { kind: "finished", loop, verdict };
  const wrong = verdict.verdict === "yes" ? automationStudioFlowBootstrapYesNotAboutThisFlow(verdict) : verdict;
  return { kind: "judged", judgement: automationStudioFlowBootstrapWithJudgeAccount(input.judgement, wrong), judgingUsd: verdict.spent.estimatedCostUsd, verdict: wrong };
}
