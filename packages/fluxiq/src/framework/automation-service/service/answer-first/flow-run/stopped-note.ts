// Why a saved Flow's run stopped short, in the step log (t869). The attempt reads Core's words for it
// (`./steps-ran.ts`) and a round is told those, never a code; but the words alone cannot say which node
// refused what, and without the codes nobody could say why a later attempt's run of a saved Flow stopped
// (as `../attempt/draft-save.ts` says of a draft). A step log is not what a person reads.
//
// Only codes, categories and node definitions: a failure's message may quote a value, so none is kept.

import { automationStudioUnresolvedFailedAttempt } from "../../../../../runtime/adaptation/recovery/index.ts";
import { automationStudioLlmStepLogNote } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioAnswerFirstFlowRunOutcome } from "./outcome.ts";

/** How deep a child Flow's failure is followed: a repeat inside a repeat is already rare. */
const MOST_DEPTH = 4;

export function automationStudioAnswerFirstFlowRunStoppedNote(outcome: AutomationStudioAnswerFirstFlowRunOutcome, trace: AutomationStudioGraphExecutionTrace | undefined): void {
  if (outcome.kind !== "ran" || outcome.reachedEnd || !outcome.failing) return;
  const chain = failedChain(trace?.attempts ?? [], 0);
  const where = chain.length > 0 ? chain.join(" inside ") : trace?.failure ? `${trace.failure.category}/${trace.failure.code}` : "no failed node named";
  automationStudioLlmStepLogNote(`The saved Flow's run stopped at step ${outcome.failing.position}: ${outcome.failing.code ?? "no code given"}; ${where}`);
}

/** The failed node of the innermost child Flow first, then each node that ran the one before it. */
function failedChain(attempts: readonly AutomationStudioNodeAttemptTrace[], depth: number): string[] {
  const failed = automationStudioUnresolvedFailedAttempt(attempts);
  if (!failed) return [];
  const own = `${failed.definitionId} (${failed.failure ? `${failed.failure.category}/${failed.failure.code}` : failed.status})`;
  const inner = depth < MOST_DEPTH && failed.childTrace ? failedChain(failed.childTrace.attempts, depth + 1) : [];
  return [...inner, own];
}
