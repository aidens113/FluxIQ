import {
  automationStudioLlmTaskExpectsDiagnosis,
  isAutomationStudioModelAuthoredTargetOverrideTarget,
  isAutomationStudioNoRepairReason,
  type AutomationStudioLlmStructuredResponse,
  type AutomationStudioLlmTaskRequest,
  type AutomationStudioLlmUsageSummary
} from "../harness.ts";
import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS, automationStudioFlowBootstrapSizeLimitsOfContext, parseAutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import { automationStudioLlmEvidenceNormalizedDecisionResponse } from "../evidence-loop-decision.ts";
import { automationStudioDeepSeekCacheHitInputTokens, estimateAutomationStudioDeepSeekCostUsd } from "./pricing.ts";
import { AUTOMATION_STUDIO_EVIDENCE_DECISION_MAX_SUMMARY_LENGTH } from "./output-schema.ts";
import type { AutomationStudioDeepSeekModel } from "./models.ts";
import { isRecord } from "./json-record.ts";

/** The answer and what it cost, read out of the reply the provider sent. */
export function parseAutomationStudioDeepSeekEnvelope(
  value: unknown,
  request: AutomationStudioLlmTaskRequest,
  model: AutomationStudioDeepSeekModel
): { response: AutomationStudioLlmStructuredResponse; usage: AutomationStudioLlmUsageSummary } {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length !== 1) malformed();
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") malformed();
  if (choice.finish_reason === "length") {
    if (choice.message.content.trim() === "") {
      throw new AutomationStudioLlmProviderError("llm.provider_output_padding_truncated", "DeepSeek reached the configured output-token limit without substantive content.");
    }
    throw new AutomationStudioLlmProviderError("llm.provider_output_truncated", "DeepSeek stopped at the configured output-token limit.");
  }
  if (choice.finish_reason !== "stop") malformed();
  const structured = parseDeepSeekJsonContent(choice.message.content);
  const usage = value.usage;
  if (!isRecord(usage)) usageInvalid();
  const inputTokens = nonNegativeInteger(usage.prompt_tokens);
  const outputTokens = nonNegativeInteger(usage.completion_tokens);
  const totalTokens = nonNegativeInteger(usage.total_tokens);
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined || totalTokens !== inputTokens + outputTokens) usageInvalid();
  if (inputTokens > request.tokenLimits.maxInputTokens || outputTokens > request.tokenLimits.maxOutputTokens || totalTokens > request.tokenLimits.maxTotalTokens) usageLimitExceeded();
  const cacheHitInputTokens = automationStudioDeepSeekCacheHitInputTokens(usage, inputTokens);
  return {
    response: parseDeepSeekStructuredResponse(structured, request),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      ...(cacheHitInputTokens === undefined ? {} : { cacheHitInputTokens, cacheMissInputTokens: inputTokens - cacheHitInputTokens }),
      estimatedCostUsd: estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, cacheHitInputTokens ?? 0, model)
    }
  };
}

function parseDeepSeekStructuredResponse(structured: unknown, request: AutomationStudioLlmTaskRequest): AutomationStudioLlmStructuredResponse {
  if (automationStudioLlmTaskExpectsDiagnosis(request.taskKind)) {
    if (!isRecord(structured) || structured.kind !== "diagnosis") outputInvalid();
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

/**
 * The JSON value in a DeepSeek reply's content.
 *
 * DeepSeek in JSON mode has been observed, live and on every call of a run, to
 * return one complete object followed by a single surplus `}`. Parsing the whole
 * string failed at its last character, so the reply counted as malformed and an
 * exploration ended after its first call. Only that shape is repaired: after
 * the first complete top-level object, nothing but closing brackets and
 * whitespace may follow. Trailing text, a second value, or an object that does
 * not itself parse is still malformed, and the value is fully validated by the
 * caller either way.
 */
function parseDeepSeekJsonContent(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const end = firstTopLevelJsonObjectEnd(content);
    if (end === undefined || !/^[\s}\]]*$/u.test(content.slice(end))) malformed();
    try {
      return JSON.parse(content.slice(0, end)) as unknown;
    } catch {
      malformed();
    }
  }
}

/** The index just past the first complete top-level object in `content`, or `undefined` when there is none. */
function firstTopLevelJsonObjectEnd(content: string): number | undefined {
  let index = 0;
  while (index < content.length && /\s/u.test(content.charAt(index))) index += 1;
  if (content.charAt(index) !== "{") return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; index < content.length; index += 1) {
    const char = content.charAt(index);
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
      if (depth < 0) return undefined;
    }
  }
  return undefined;
}

function malformed(): never {
  throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "DeepSeek returned an invalid response envelope.");
}

function outputInvalid(): never {
  throw new AutomationStudioLlmProviderError("llm.provider_output_invalid", "DeepSeek returned output that does not satisfy the requested structure.");
}

function usageInvalid(): never {
  throw new AutomationStudioLlmProviderError("llm.provider_usage_invalid", "DeepSeek returned invalid token usage.");
}

function usageLimitExceeded(): never {
  throw new AutomationStudioLlmProviderError("llm.provider_usage_limit_exceeded", "DeepSeek reported usage above the configured token limits.");
}

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : undefined;
}
