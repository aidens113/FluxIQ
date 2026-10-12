// A paid decision stopped before tool execution still leaves a trace row.
// Unoffered calls and an offered call that returned after the deadline have
// different codes. Unknown tool names are never written as Core identifiers.
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "./trace.ts";

/** A paid final decision withheld from execution, with its actual stopping code. */
export function automationStudioLlmEvidenceFinalDecisionRow(
  iteration: number,
  decision: { toolId: string; usage?: AutomationStudioLlmUsageSummary | undefined },
  toolIds: ReadonlySet<string>,
  resultCode: "llm_evidence_loop.not_offered" | "llm_evidence_loop.duration_limit" = "llm_evidence_loop.not_offered"
): AutomationStudioLlmEvidenceLoopTrace {
  const usage = decision.usage ? { usage: decision.usage } : {};
  return toolIds.has(decision.toolId)
    ? { iteration, decision: "tool_call", toolId: decision.toolId, resultCode, ...usage }
    : { iteration, decision: "unusable", resultCode, ...usage };
}
