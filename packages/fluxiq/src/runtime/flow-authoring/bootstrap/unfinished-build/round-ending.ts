// How one live round ended, read for what the build does next.
//
// **The line this draws is the user's (2026-09-30).** A round that stopped
// short -- a round its caller ended on loop detection's signal, or its model's
// own ask -- has a Flow as far as it got, and that Flow is tested, judged and
// repaired; the round's ending is never the build's. A round a budget stopped
// -- its spend, its tokens, its deadline -- is reported as exactly that. No
// count of decisions or tool calls ends a round any more (t1056).
//
// **A stall's steps keep their scheduled candidates (t274-c4b).** A stall
// hands over the loop's own steps, which the loop may still hold, so they are
// copied; a deep copy lends a step no scheduled candidate
// (`../../flow-draft/scheduled-candidate/`). Every round of live run
// `run-muw60j7c-bb7c9a62`'s re-author ended this way (48 `stopped:
// unusable_decisions`), and with the candidates gone the repair seed
// (`./judgement.ts`) had nothing to carry: the next round would have listed the
// unchanged carried steps 1, 2, 4 and 5 for a live rerun the domain refuses.
// The loop's stalls hand over copies too, all made by one function
// (`../../flow-draft/scheduled-candidate/step-copy.ts`), so a candidate survives
// both copies (t690).
import { automationStudioFlowDraftStepCopy } from "../../draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import type { AutomationStudioLlmEvidenceLoopBudgetBound } from "../../../llm/evidence-loop/index.ts";
import type { AutomationStudioFlowBootstrapBudgetBound } from "../generation-failure/index.ts";
import type { AutomationStudioFlowBootstrapRoundEnding } from "./contracts.ts";
import { AutomationStudioFlowBootstrapUnfinishedStall } from "./unfinished-stall.ts";

const BUDGET_BOUNDS: Readonly<Record<AutomationStudioLlmEvidenceLoopBudgetBound, AutomationStudioFlowBootstrapBudgetBound>> = Object.freeze({
  cost: "cost",
  tokens: "tokens",
  duration: "duration",
  calls: "calls"
});

/** The round's ending: finished, stopped short, stopped by a budget, or one this lifecycle does not reach past. */
export function automationStudioFlowBootstrapRoundEnding(
  outcome: AutomationStudioLlmEvidenceLoopResult | AutomationStudioFlowBootstrapUnfinishedStall
): AutomationStudioFlowBootstrapRoundEnding {
  if (outcome instanceof AutomationStudioFlowBootstrapUnfinishedStall) {
    const { issueCodes, trace, accounting, steps } = outcome.progress;
    return { kind: "unfinished", stopped: "unusable_decisions", steps: steps.map((step) => automationStudioFlowDraftStepCopy(step)), lastIssueCodes: [...issueCodes], completionAttempts: 0, progress: { trace, accounting } };
  }
  if (outcome.ok) return { kind: "finished", loop: outcome };
  const progress = { trace: outcome.trace, accounting: outcome.accounting };
  if (outcome.code === "llm_evidence_loop.repeat_without_progress") {
    return { kind: "unfinished", stopped: "repeat_without_progress", steps: outcome.steps, lastIssueCodes: [], completionAttempts: 0, progress };
  }
  if (outcome.code === "llm_evidence_loop.provider_unavailable" && outcome.providerUnavailable) {
    const lastCode = outcome.trace.at(-1)?.resultCode;
    return { kind: "provider_unavailable", stopped: "unusable_decisions", providerUnavailable: outcome.providerUnavailable, steps: outcome.steps, lastIssueCodes: lastCode ? [lastCode] : [], completionAttempts: 0, progress };
  }
  const exhaustion = outcome.code === "llm_evidence_loop.iteration_limit" ? outcome.exhaustion : undefined;
  if (!exhaustion) return { kind: "other", loop: outcome };
  // The unreadable replies the budget ran out during ride on its record, for its ending to say (t1056).
  const held = { steps: outcome.steps, lastIssueCodes: [...exhaustion.lastIssueCodes], completionAttempts: exhaustion.completionAttempts, progress: { ...progress, exhaustion, ...(outcome.unreadable ? { unreadable: outcome.unreadable } : {}) } };
  // Only a budget runs out (t1056); one that names no bound is not a round this lifecycle reads.
  if (!exhaustion.budgetBound) return { kind: "other", loop: outcome };
  return { kind: "budget", bound: BUDGET_BOUNDS[exhaustion.budgetBound], ...held };
}
