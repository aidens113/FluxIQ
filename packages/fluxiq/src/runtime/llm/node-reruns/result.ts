import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioLlmRunNodesStopReason } from "./types.ts";

type SuccessfulReceipt = { kind: "succeeded"; resultCode: string | undefined };

/** Positive success is required; a missing ok is never itself success. */
export function automationStudioLlmRunNodesReadReceipt(value: unknown): SuccessfulReceipt | { kind: "stopped"; reason: AutomationStudioLlmRunNodesStopReason } {
  try {
    if (!record(value) || value.kind !== "llm_evidence_tool_execution") return { kind: "stopped", reason: "invalid_result" };
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult(value as AutomationStudioLlmEvidenceToolExecutionResult, "mutate");
    if (!parsed) return { kind: "stopped", reason: "invalid_result" };
    if (parsed.personNeeded) return { kind: "stopped", reason: "person_needed" };
    const failure = Object.getOwnPropertyDescriptor(value, "failure");
    if (failure && (!Object.hasOwn(failure, "value") || (failure.value !== undefined && !parsed.failure))) return { kind: "stopped", reason: "invalid_result" };
    if (parsed.failure?.effect === "ambiguous" || parsed.failure?.category === "ambiguous_or_unknown") return { kind: "stopped", reason: "uncertain_result" };
    if (parsed.failure) return { kind: "stopped", reason: "failed_result" };
    if (parsed.draft?.written || parsed.resultCode === "core.run_node.written") return { kind: "stopped", reason: "invalid_result" };
    if (!record(parsed.evidence) || parsed.evidence.ok !== true) return { kind: "stopped", reason: "failed_result" };
    return { kind: "succeeded", resultCode: parsed.resultCode };
  } catch {
    return { kind: "stopped", reason: "invalid_result" };
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
