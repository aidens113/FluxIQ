import { automationStudioLlmTaskExpectsDiagnosis, isAutomationStudioModelAuthoredTargetOverrideTarget, isAutomationStudioNoRepairReason, type AutomationStudioLlmStructuredResponse, type AutomationStudioLlmTaskRequest, type AutomationStudioLlmUsageSummary } from "../harness.ts";
import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS, automationStudioFlowBootstrapSizeLimitsOfContext, parseAutomationStudioFlowBootstrapPlan } from "../../../flow-authoring/bootstrap/index.ts";
import { automationStudioLlmEvidenceNormalizedDecisionResponse } from "../evidence-loop-decision.ts";
import { AUTOMATION_STUDIO_EVIDENCE_DECISION_MAX_SUMMARY_LENGTH } from "./output-schema.ts";
import type { AutomationStudioDeepSeekModel } from "./models.ts";
import { isRecord } from "./json-record.ts";
import { automationStudioDeepSeekVerdictBeforeCut } from "./verdict-before-cut.ts";
import { parseAutomationStudioDeepSeekEnvelope as readEnvelope } from "../../../models/providers/deepseek/index.ts";
export { automationStudioDeepSeekContentCase, automationStudioDeepSeekMalformedReply } from "../../../models/providers/deepseek/index.ts";

/** Studio injects the exact task-schema interpretation and its verification-specific cut handling. */
export function parseAutomationStudioDeepSeekEnvelope(value: unknown, request: AutomationStudioLlmTaskRequest, model: AutomationStudioDeepSeekModel, sentAtMs?: number): { response: AutomationStudioLlmStructuredResponse; usage: AutomationStudioLlmUsageSummary } {
  return readEnvelope(value, request, model, sentAtMs, {
    readResponse: (structured, paid, cut) => parseDeepSeekStructuredResponse(structured, request, paid, cut),
    ...(request.taskKind === "loop_verification" ? { readTruncatedContent: automationStudioDeepSeekVerdictBeforeCut } : {})
  });
}

function parseDeepSeekStructuredResponse(structured: unknown, request: AutomationStudioLlmTaskRequest, paid: AutomationStudioLlmUsageSummary | undefined, cut = false): AutomationStudioLlmStructuredResponse {
  const outputInvalid: () => never = () => refusePaid("llm.provider_output_invalid", "DeepSeek returned output that does not satisfy the requested structure.", paid);
  if (automationStudioLlmTaskExpectsDiagnosis(request.taskKind)) {
    if (!isRecord(structured) || structured.kind !== "diagnosis") outputInvalid();
    // Only Core says a reply was cut after its verdict (t653, `./verdict-before-cut.ts`): a whole reply's own claim is dropped.
    if (structured.truncatedAfterVerdict !== undefined && !cut) {
      const { truncatedAfterVerdict: _claimed, ...answered } = structured;
      return answered as AutomationStudioLlmStructuredResponse;
    }
    return structured as AutomationStudioLlmStructuredResponse;
  }
  if (request.taskKind === "runtime_patch") {
    if (!isRecord(structured)) outputInvalid();
    // A declined repair is the other answer this call may have, and it names
    // one of Core's reasons rather than prose of its own.
    if (structured.kind === "no_repair") {
      if (!isAutomationStudioNoRepairReason(structured.reason)) outputInvalid();
      return structured as AutomationStudioLlmStructuredResponse;
    }
    if (structured.kind !== "runtime_patch") outputInvalid();
    if (!Array.isArray(structured.patches)
      || structured.patches.some((patch) => isRecord(patch)
        && patch.kind === "temporary_target_override"
        && !isAutomationStudioModelAuthoredTargetOverrideTarget(patch.target))) outputInvalid();
    return structured as AutomationStudioLlmStructuredResponse;
  }
  if (request.taskKind === "evidence_tool_decision") {
    // Everything Core can work out for itself is worked out rather than
    // refused: the wrapper's own name, a decision that arrived without its
    // wrapper, a summary over its length or missing
    // (`evidence-loop-decision.ts`). What the decision may be is unchanged.
    const decision = automationStudioLlmEvidenceNormalizedDecisionResponse(structured, AUTOMATION_STUDIO_EVIDENCE_DECISION_MAX_SUMMARY_LENGTH);
    if (!decision) outputInvalid();
    return decision as AutomationStudioLlmStructuredResponse;
  }
  if (request.taskKind !== "flow_bootstrap") return structured as AutomationStudioLlmStructuredResponse;
  if (!isRecord(structured)
    || Object.keys(structured).some((key) => !["kind", "summary", "plan"].includes(key))
    || structured.kind !== "flow_bootstrap"
    || typeof structured.summary !== "string"
    || structured.summary.trim().length === 0
    || structured.summary.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxStringLength) outputInvalid();
  const parsed = parseAutomationStudioFlowBootstrapPlan(structured.plan, automationStudioFlowBootstrapSizeLimitsOfContext(request.context.flowBootstrap));
  if (!parsed.plan || parsed.issues.some((issue) => issue.severity === "error")) outputInvalid();
  return { kind: "flow_bootstrap", summary: structured.summary, plan: parsed.plan };
}

function refusePaid(code: "llm.provider_output_invalid" | "llm.provider_output_truncated" | "llm.provider_output_padding_truncated" | "llm.provider_usage_invalid" | "llm.provider_usage_limit_exceeded", message: string, paid: AutomationStudioLlmUsageSummary | undefined): never {
  throw new AutomationStudioLlmProviderError(code, message, false, undefined, undefined, undefined, undefined, undefined, undefined, paid);
}
