import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../decision-handlers/index.ts";
import type { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceLoopDecision, AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";
import { automationStudioLlmEvidenceCallRecord, automationStudioLlmEvidenceCallDiagnostic } from "../evidence-loop/call-record.ts";
import type { automationStudioLlmEvidenceBatchMember } from "./batch-member.ts";

/** Retain real wrapper/auxiliary evidence without claiming an unproved main ran. */
export function automationStudioLlmPriorNodesUnsettled(input: {
  context: AutomationStudioLlmEvidenceDecisionHandlerContext;
  iteration: number;
  callId: string;
  decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>;
  tool: AutomationStudioLlmEvidenceTool;
  member: ReturnType<typeof automationStudioLlmEvidenceBatchMember>;
  execution: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>;
  stateBefore: string | undefined;
  stateAfter: string | undefined;
  useCallStates: boolean;
}) {
  const { context: ctx, execution, member, decision, callId, iteration } = input;
  const uncertain = member.main === "unproven";
  const code = uncertain ? "core.run_nodes.member_unproven" : "core.run_nodes.member_unacted";
  const value = execution?.evidence ?? { ok: false, code };
  const evidenceBytes = ctx.accountEvidence(value);
  ctx.evidence.push({ callId, toolId: decision.toolId, value });
  ctx.history.record(iteration, { kind: "unusable", signature: code, issueCodes: [code] });
  ctx.recordRow({ iteration, decision: "unusable", callId, toolId: decision.toolId, resultCode: code, evidenceBytes, ...(execution ? automationStudioLlmEvidenceCallDiagnostic(execution) : {}), ...(execution?.actionability ? { actionability: execution.actionability } : {}) }, { draftChanged: false });
  const stateBefore = input.useCallStates ? execution?.stateDigests?.before : input.stateBefore;
  const stateAfter = input.useCallStates ? execution?.stateDigests?.after : input.stateAfter;
  if (stateAfter !== undefined) {
    ctx.callStates.set(callId, stateAfter);
    ctx.repeats.seen(stateAfter);
  }
  if (uncertain) {
    // Unknown main status retains an attempted-call allowance, without proving an executed node.
    ctx.accounting.toolCalls += 1;
    ctx.counters.failedToolCalls += 1;
    const record = automationStudioLlmEvidenceCallRecord(input.tool, decision.input, execution);
    ctx.repeats.recorded({ callId, toolId: decision.toolId, input: decision.input, effect: record.effect, proposes: record.proposes ?? record.effect === "mutate", effectApplied: false, refused: true, resultCode: code,
      stateBefore, stateAfter,
      failure: { stage: "execution", category: "ambiguous_or_unknown", effect: "ambiguous", code, retryable: false }
    });
  }
}
