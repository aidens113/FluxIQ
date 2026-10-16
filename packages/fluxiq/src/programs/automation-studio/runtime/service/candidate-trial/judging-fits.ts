// A trial is started only when the purse can pay the two judge calls that
// judge it (t661, A8 towels debug `run-mvac0nmw-52ed30b2`, fix 8).
//
// A trial is judged by a pair of calls: a first answer, then a second that
// confirms a yes or asks a non-yes again (`../../result-verification/build-test/`).
// In the towels run a repair brief's last trial ran the site for 54 seconds,
// paid $0.0042 for the first judge call, and could not hold the second: the
// trial came back not judged, and the money and the site work bought nothing.
//
// So before a trial acts on the site -- before its start hook, before its run
// -- the purse the judge's calls would be held against (the current one on
// this async chain, `../../llm/build-purse/run.ts`, the same one the harness
// holds them against) is asked to hold both, each at a judge call's worst case,
// and both holds are released at once. Nothing is spent and nothing is capped:
// where both fit, the trial runs exactly as before; where either is refused, the
// trial does not start and says so in figures. A refusal met here is the probe's
// own, not the build's: the purse's refusal as the run saw it before the probe
// is put back on it and on every purse above it, so the loop does not end on a
// call nobody made.
//
// **The worst case.** A judge call's prompt is the trial's evidence, measured
// only once the trial has run. So each call is held at the largest judge prompt
// this build's earlier trials sent (`judgeInputTokens`, Core's own record of
// their judge spend), and never below the standing judge input the purse sizes
// its judging reserve by; its reply at the judge reply reserve
// (`AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES`), all of it uncached, priced at
// the provider's price the purse last learned. Without a price the purse holds
// each at the most any call here has cost, as it holds an unpriced call.

import type { JsonObject } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES,
  automationStudioLlmCurrentBuildPurse,
  type AutomationStudioLlmBuildPurse,
  type AutomationStudioLlmBuildPurseCall,
  type AutomationStudioLlmBuildPurseRefusal
} from "../../llm/build-purse/index.ts";

/** The judge calls one trial needs: a first answer and its confirming call. */
const JUDGE_CALLS = 2;

/**
 * Why a trial cannot start, in figures, or nothing when the purse can hold
 * both of its judge calls or no purse is in force (header). `code` is the
 * caller's (`candidate.trial_unaffordable`, `subflow.trial_unaffordable`).
 * `judgeInputTokens` is the largest judge prompt an earlier trial sent, when
 * one did.
 */
export function automationStudioTrialJudgingShortfall(input: { code: string; judgeInputTokens?: number | undefined; purse?: AutomationStudioLlmBuildPurse | undefined }): JsonObject | undefined {
  const purse = input.purse ?? automationStudioLlmCurrentBuildPurse();
  if (!purse) return undefined;
  const inputTokens = Math.max(AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeInputTokens, Math.ceil(input.judgeInputTokens ?? 0));
  const outputTokens = AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeReplyTokens;
  const eachUsd = purse.priceUsd(inputTokens, outputTokens);
  const call: AutomationStudioLlmBuildPurseCall = { projectedCostUsd: eachUsd, estimatedInputTokens: inputTokens, maxOutputTokens: outputTokens, judge: true };
  const before = refusalsOf(purse);
  const held: Array<{ release(): void }> = [];
  let refusal: AutomationStudioLlmBuildPurseRefusal | undefined;
  for (let index = 0; index < JUDGE_CALLS && !refusal; index += 1) {
    const hold = purse.hold(call);
    if (hold.ok) held.push(hold.hold);
    else refusal = hold.refusal;
  }
  const heldUsd = held.length * (eachUsd ?? 0);
  for (const hold of held) hold.release();
  if (!refusal) return undefined;
  // The probe's refusal is not the build's (header).
  for (const [owner, was] of before) owner.refusal = was;
  return {
    code: input.code,
    judgeCalls: JUDGE_CALLS,
    ...(eachUsd === undefined ? {} : { judgeCallUsd: usd(eachUsd), neededUsd: usd(JUDGE_CALLS * eachUsd) }),
    ...figures(refusal, held.length, heldUsd),
    happened: `Core did not start this trial: the build's money left cannot pay the ${JUDGE_CALLS} judge calls that judge a trial${eachUsd === undefined ? "" : ` (about $${usd(JUDGE_CALLS * eachUsd)} at worst)`}. The site was not touched and no judge was asked.`
  };
}

/** The refusal each purse from `purse` up holds as the current run sees it, to put back after the probe. */
function refusalsOf(purse: AutomationStudioLlmBuildPurse): Array<[AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseRefusal | undefined]> {
  const kept: Array<[AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseRefusal | undefined]> = [];
  for (let owner: AutomationStudioLlmBuildPurse | undefined = purse; owner; owner = owner.parent) kept.push([owner, owner.refusal]);
  return kept;
}

/** What was left when the probe was refused, from the refusal's own figures, its own first hold taken out. */
function figures(refusal: AutomationStudioLlmBuildPurseRefusal, ownHeldCalls: number, ownHeldUsd: number): JsonObject {
  if (refusal.code === "llm_budget.run_call_limit") {
    return { refusedBy: refusal.code, callsLeft: Math.max(0, refusal.maxCalls - refusal.spentCalls - Math.max(0, refusal.pendingCalls - ownHeldCalls) - refusal.keptBackCalls - (refusal.allottedCalls ?? 0)) };
  }
  const pendingUsd = Math.max(0, refusal.pendingUsd - ownHeldUsd);
  return { refusedBy: refusal.code, leftUsd: usd(Math.max(0, refusal.ceilingUsd - refusal.spentUsd - pendingUsd - (refusal.allottedUsd ?? 0))) };
}

/** Dollars to the sixth place, as the purse's figures are compared. */
function usd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * The largest judge prompt the trials in `records` sent, per call, from their
 * judges' own spend; nothing when none was judged. What the next trial's judge
 * calls are held at (header).
 */
export function automationStudioTrialLargestJudgePrompt(records: ReadonlyArray<{ judge: { calls: number; inputTokens: number } }>): number | undefined {
  const prompts = records.filter((record) => record.judge.calls > 0 && Number.isFinite(record.judge.inputTokens)).map((record) => record.judge.inputTokens / record.judge.calls);
  return prompts.length ? Math.ceil(Math.max(...prompts)) : undefined;
}
