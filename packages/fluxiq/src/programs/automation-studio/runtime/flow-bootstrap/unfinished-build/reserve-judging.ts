// A round the judging reserve stopped: the reserve is spent judging the Flow
// as it stands, never left unspent (user, t254 stage 2, decision 4).
//
// **What was wrong.** From a build's start its purse keeps a judging pair back
// from every call that is not a judge's (`./round-funding.ts`,
// `../../llm/build-purse/purse.ts`), so a round's judging is always paid for.
// A round whose next decision would have eaten into that reserve was refused
// the decision and ended as any cost stop does: the build ended
// `budget_exhausted` with the reserve unspent and the Flow so far never judged.
// Live run murzln6g's repair at peak rates was refused its first decision
// beside $0.0068 kept back, and ended with its draft untested.
//
// **What happens now.** Such a round -- a cost refusal with `keptBackUsd` --
// has its Flow tested from its start, as a round that stopped short has
// (`./judgement.ts`), and a clean test is put to the build's judge, whose calls
// draw on the reserve. A yes about that very Flow (its `flowSignature`, the
// rule of 2026-10-02) finishes the build with it. Anything else ends the build
// at its budget with the judge's account in the message and the Flow kept as a
// draft (`./budget-exhausted.ts`) -- never "not doable", even on a judge's
// `stillAchievable: "no"`: money stopped this build, not a judged dead end.
//
// Nothing is judged where there is nothing to judge: an empty Flow, one no
// replay can run, one whose test did not run clean (the judge reads a passing
// test), or one the caller cannot build as it stands (`accept`) -- a yes could
// finish none of them, so the reserve is not spent on one. Those end at cost
// as before, with what the test found.
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapRoundProgress, AutomationStudioFlowBootstrapTestVerdict } from "./contracts.ts";
import { automationStudioFlowBootstrapWithJudgeAccount, automationStudioFlowBootstrapYesNotAboutThisFlow } from "./judgement.ts";

type FinishedLoop = Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }>;

/** What the Flow a reserve-stopped round left is said to be when it is built: it never had a completion of its own. */
const RESERVE_JUDGED_SUMMARY = "Flow built from the steps that ran before the build reached its spending limit.";

/** How judging the Flow a reserve-stopped round left went. */
export type AutomationStudioFlowBootstrapReserveJudging =
  /** Nothing was judged (see the module comment): the build ends at cost as it would have. */
  | { kind: "not_judged" }
  /** The build was cancelled while it was judged. */
  | { kind: "cancelled" }
  /** Judged yes about the Flow as it stands: the build's result, as a finished round's. */
  | { kind: "finished"; loop: FinishedLoop; verdict: Extract<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }> }
  /** Judged, and not found to do what was asked: the judgement with the judge's account, and what judging cost. */
  | { kind: "judged"; judgement: AutomationStudioFlowBootstrapJudgement; judgingUsd: number };

/**
 * Judges the Flow a round left when the judging reserve stopped it.
 * `judgement` and `seed` are that round's tested judgement and the Flow it
 * tested (`automationStudioFlowBootstrapJudgeUnfinished`); `judge` is the
 * build's, with its spend already accounted by the caller.
 */
export async function automationStudioFlowBootstrapJudgeAtReserve(input: {
  judgement: AutomationStudioFlowBootstrapJudgement;
  seed: AutomationStudioFlowDraftStep[];
  progress: AutomationStudioFlowBootstrapRoundProgress;
  /** Whether the caller can build the Flow as it stands, and makes it the plan it will build if the build finishes. Absent: it can. */
  accept?: ((loop: FinishedLoop) => Promise<boolean>) | undefined;
  judge(loop: FinishedLoop): Promise<AutomationStudioFlowBootstrapTestVerdict | "cancelled">;
}): Promise<AutomationStudioFlowBootstrapReserveJudging> {
  if (!input.judgement.stepsInFlow || input.judgement.tested !== "replayed_clean") return { kind: "not_judged" };
  // The round's own record, and the Flow as its test ran it: the judge's test report numbers steps as the seed does.
  const loop: FinishedLoop = { ok: true, result: { summary: RESERVE_JUDGED_SUMMARY }, trace: [...input.progress.trace], steps: input.seed, accounting: { ...input.progress.accounting } };
  if (input.accept && !(await input.accept(loop))) return { kind: "not_judged" };
  const verdict = await input.judge(loop);
  if (verdict === "cancelled") return { kind: "cancelled" };
  if (verdict.verdict === "yes" && verdict.flowSignature === automationStudioFlowDraftFlowSignature(input.seed)) return { kind: "finished", loop, verdict };
  const wrong = verdict.verdict === "yes" ? automationStudioFlowBootstrapYesNotAboutThisFlow(verdict) : verdict;
  return { kind: "judged", judgement: automationStudioFlowBootstrapWithJudgeAccount(input.judgement, wrong), judgingUsd: verdict.spent.estimatedCostUsd };
}
