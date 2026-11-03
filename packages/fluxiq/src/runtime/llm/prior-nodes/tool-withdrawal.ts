import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../decision-handlers/index.ts";
import { automationStudioLlmDecisionContextSignature } from "../decision-context/signature.ts";
import { automationStudioLlmUnusableDecisionIssueSet } from "../unusable-decision.ts";
import type { AutomationStudioLlmEvidenceLoopDecision } from "../evidence-loop/index.ts";
import { automationStudioLlmEvidenceLoopFailure } from "../evidence-loop/result.ts";

/** A withdrawn look retains the ordinary refusal/no-progress/history behavior. */
export function automationStudioLlmEvidenceToolWithdrawal(input: {
  context: AutomationStudioLlmEvidenceDecisionHandlerContext;
  iteration: number;
  decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>;
  refuse(issueCodes: string[]): "ask_again" | { error: unknown };
}) {
  const { context: ctx, iteration, decision } = input;
  const issueCodes = [ctx.looks.refusalCode(ctx.counters.attemptEpoch)];
  ctx.noProgress.sameIssuesAgain(automationStudioLlmUnusableDecisionIssueSet(issueCodes));
  if (ctx.noProgress.steps + 1 >= ctx.limits.maxStepsWithoutProgress) {
    ctx.history.record(iteration, { kind: "unusable", signature: automationStudioLlmDecisionContextSignature({ kind: "unusable", issueCodes }), issueCodes });
    ctx.noProgress.stepped();
    ctx.recordRow({ iteration, decision: "unusable", resultCode: issueCodes[0]!, ...(decision.usage ? { usage: decision.usage } : {}) });
    return automationStudioLlmEvidenceLoopFailure(ctx.draftSteps, "llm_evidence_loop.repeat_without_progress", ctx.trace, ctx.accounting);
  }
  const refused = input.refuse(issueCodes);
  if (refused === "ask_again") return undefined;
  if (ctx.input.propagateDecisionErrors) throw refused.error;
  return automationStudioLlmEvidenceLoopFailure(ctx.draftSteps, "llm_evidence_loop.invalid_decision", ctx.trace, ctx.accounting);
}
