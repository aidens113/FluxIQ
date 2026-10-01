// The row the last decision leaves when it was spent on something it was not
// offered.
//
// The last decision a budget allows is offered only completion
// (`../loop-budget.ts`). One spent on a tool call ends the loop as the budget
// it is, and that decision was paid for like every other, so it leaves its row
// like every other. It used to leave none: a build that ended there published
// one decision fewer than it paid for and counted (`iterationCount` 20 beside
// `decisionCount` 19; t214).
//
// The tool is named only when it is one the loop has. A name the model made
// up is not a Core identifier and would refuse the whole published record, so
// that call is recorded as the unusable decision it was.
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "./trace.ts";

/** The trace row of a last decision that asked for a call it was not offered. */
export function automationStudioLlmEvidenceFinalDecisionRow(
  iteration: number,
  decision: { toolId: string; usage?: AutomationStudioLlmUsageSummary | undefined },
  toolIds: ReadonlySet<string>
): AutomationStudioLlmEvidenceLoopTrace {
  const usage = decision.usage ? { usage: decision.usage } : {};
  return toolIds.has(decision.toolId)
    ? { iteration, decision: "tool_call", toolId: decision.toolId, resultCode: "llm_evidence_loop.not_offered", ...usage }
    : { iteration, decision: "unusable", resultCode: "llm_evidence_loop.not_offered", ...usage };
}
