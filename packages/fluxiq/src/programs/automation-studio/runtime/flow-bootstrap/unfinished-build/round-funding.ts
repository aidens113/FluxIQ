// What a build's rounds need from its purse (t240, t254).
//
// **Judging is a pair.** A build with a judge ends each finished round by
// judging its Flow, and judging is two sequential calls: a first answer, then a
// second that confirms a `yes` (lane C, `../../result-verification/build-test/judge.ts`)
// or asks a non-yes again (`../../result-verification/verify.ts`). The round
// gate counted one, so a round could open whose judging the purse could not
// finish.
//
// **The next round's first decision is priced from its own request.** The gate
// used to hold it at the previous round's last decision, the largest of that
// round, though every first repair decision in t254's runs was smaller
// (0.39-0.90 times; a repair starts from a fresh window). Its size is not known
// until the round builds it, so the gate asks only for the least any decision
// can be held at -- its reply reserve, with no input -- and the purse prices
// the real first request when it is sent, refusing it, unsent, if it does not
// fit beside the judging kept back for the round's end. Both are priced at the
// rate in force when the gate is read, peak or off-peak.
//
// **Judging is kept back while the build explores.** From the build's start the
// purse keeps the judging pair back from every call that is not a judge's
// (`../../llm/build-purse/purse.ts`, `keepBackForJudging`), so exploration and
// repairs cannot spend what the test's judging needs. `run-murzln6g` spent
// $0.089 of $0.10 over thirty exploration decisions and reached its judgement
// with $0.0111 left, against a gate of $0.0187.
//
// The reserves come from the purse's own leaf module, never `../../llm/index.ts`: that barrel reaches back into `flow-bootstrap/`, and importing a value from it here closed a module cycle that left the harness undefined in tests.
import { AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES, type AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioFlowBootstrapNextRoundHold } from "./budget-exhausted.ts";

/** The judge calls judging one Flow takes at most: a first answer and a second (`../../result-verification/verify.ts`). */
const JUDGING_CALLS = 2;

/**
 * A build's round funding under `purse`: with a judge, the judging pair is kept
 * back from every other call from now on; `nextRound` is what one more round
 * needs at least. Without a purse there is nothing to fund and `nextRound` is
 * `undefined`.
 */
export function automationStudioFlowBootstrapRoundFunding(purse: AutomationStudioLlmBuildPurse | undefined, judged: boolean): { nextRound(): AutomationStudioFlowBootstrapNextRoundHold | undefined } {
  if (purse && judged) {
    purse.keepBackForJudging({ calls: JUDGING_CALLS, unpriced: { inputTokens: AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeInputTokens, outputTokens: AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeReplyTokens } });
  }
  return {
    nextRound: () => {
      if (!purse) return undefined;
      // The least the first decision can be held at: its reply reserve, with no input, at the rate in force now. Undefined until a call has brought the provider's price.
      const decisionUsd = purse.priceUsd(0, AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.decisionReplyTokens);
      if (decisionUsd === undefined) return undefined;
      if (!judged) return { usd: decisionUsd, judged, decisionUsd };
      const judgingUsd = purse.judgingHoldUsd();
      return judgingUsd === undefined ? { usd: decisionUsd, judged, decisionUsd } : { usd: decisionUsd + judgingUsd, judged, judgingUsd, decisionUsd };
    }
  };
}
