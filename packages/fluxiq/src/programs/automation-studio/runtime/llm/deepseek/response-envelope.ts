import {
  automationStudioLlmTaskExpectsDiagnosis,
  isAutomationStudioModelAuthoredTargetOverrideTarget,
  isAutomationStudioNoRepairReason,
  type AutomationStudioLlmStructuredResponse,
  type AutomationStudioLlmTaskRequest,
  type AutomationStudioLlmUsageSummary
} from "../harness.ts";
import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import type { AutomationStudioLlmProviderReplyAccount } from "../reply-account.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS, automationStudioFlowBootstrapSizeLimitsOfContext, parseAutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import { automationStudioLlmEvidenceNormalizedDecisionResponse } from "../evidence-loop-decision.ts";
import { automationStudioDeepSeekCacheHitInputTokens, estimateAutomationStudioDeepSeekCostUsd } from "./pricing.ts";
import { AUTOMATION_STUDIO_EVIDENCE_DECISION_MAX_SUMMARY_LENGTH } from "./output-schema.ts";
import type { AutomationStudioDeepSeekModel } from "./models.ts";
import { isRecord } from "./json-record.ts";
import { automationStudioDeepSeekClosedContent } from "./unclosed-content.ts";

/** The answer and what it cost, read out of the reply the provider sent. */
export function parseAutomationStudioDeepSeekEnvelope(
  value: unknown,
  request: AutomationStudioLlmTaskRequest,
  model: AutomationStudioDeepSeekModel,
  /** When the call was sent, in epoch milliseconds: what DeepSeek bills it at, peak or off-peak (`./pricing.ts`). Absent, the peak rate. */
  sentAtMs?: number
): { response: AutomationStudioLlmStructuredResponse; usage: AutomationStudioLlmUsageSummary } {
  // What the reply cost is read before anything can refuse it: a reply Core
  // cannot use was still paid for, and its account says so.
  const paid = isRecord(value) ? replyUsage(value.usage, model, sentAtMs) : undefined;
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length !== 1) malformed({ case: "envelope_shape" }, paid);
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) malformed({ case: "envelope_shape", ...finishReasonOf(choice) }, paid);
  if (typeof choice.message.content !== "string") malformed({ case: "content_missing", ...finishReasonOf(choice) }, paid);
  if (choice.finish_reason === "length") {
    if (choice.message.content.trim() === "") {
      refusePaid("llm.provider_output_padding_truncated", "DeepSeek reached the configured output-token limit without substantive content.", paid);
    }
    refusePaid("llm.provider_output_truncated", "DeepSeek stopped at the configured output-token limit.", paid);
  }
  if (choice.finish_reason !== "stop") malformed({ case: "finish_reason", ...finishReasonOf(choice), contentChars: choice.message.content.length }, paid);
  const structured = parseDeepSeekJsonContent(choice.message.content, paid);
  const usage = value.usage;
  if (!isRecord(usage)) usageInvalid(paid);
  const inputTokens = nonNegativeInteger(usage.prompt_tokens);
  const outputTokens = nonNegativeInteger(usage.completion_tokens);
  const totalTokens = nonNegativeInteger(usage.total_tokens);
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined || totalTokens !== inputTokens + outputTokens) usageInvalid(paid);
  // The reply's own length is not a limit (t254): no `max_tokens` is sent, so a reply longer than `maxOutputTokens` -- what the window check set aside -- is the provider's to give. The input and the window still bind.
  if (inputTokens > request.tokenLimits.maxInputTokens || totalTokens > request.tokenLimits.maxTotalTokens) usageLimitExceeded(paid);
  const cacheHitInputTokens = automationStudioDeepSeekCacheHitInputTokens(usage, inputTokens);
  return {
    response: parseDeepSeekStructuredResponse(structured, request, paid),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      ...(cacheHitInputTokens === undefined ? {} : { cacheHitInputTokens, cacheMissInputTokens: inputTokens - cacheHitInputTokens }),
      estimatedCostUsd: estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, cacheHitInputTokens ?? 0, model, sentAtMs)
    }
  };
}

function parseDeepSeekStructuredResponse(structured: unknown, request: AutomationStudioLlmTaskRequest, paid: AutomationStudioLlmUsageSummary | undefined): AutomationStudioLlmStructuredResponse {
  const outputInvalid: () => never = () => refusePaid("llm.provider_output_invalid", "DeepSeek returned output that does not satisfy the requested structure.", paid);
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
 *
 * The mirror shape is repaired too (lane C, `run-mv0fuotv-805294d7`, C3): an
 * object that never closes, only closing brackets short at its end, has the
 * closers its open brackets need appended (`./unclosed-content.ts`). Only on a
 * reply that stopped of its own accord: this runs after `length` was refused.
 * The closed text must then parse, and is validated as any reply is. Like the
 * surplus case, the repair adds nothing to the answer: the reply as sent stays
 * in the step log.
 */
function parseDeepSeekJsonContent(content: string, paid: AutomationStudioLlmProviderReplyAccount["usage"]): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const end = firstTopLevelJsonObjectEnd(content);
    const refused: () => never = () => malformed({ case: automationStudioDeepSeekContentCase(content, end), finishReason: "stop", contentChars: content.length }, paid);
    if (end === undefined) {
      const closed = automationStudioDeepSeekClosedContent(content);
      if (closed === undefined) refused();
      try {
        return JSON.parse(closed) as unknown;
      } catch {
        refused();
      }
    }
    if (!/^[\s}\]]*$/u.test(content.slice(end))) refused();
    try {
      return JSON.parse(content.slice(0, end)) as unknown;
    } catch {
      refused();
    }
  }
}

/**
 * Which kind of damage a reply's content has, read from its structure alone:
 * where its first `{` is, and whether the object that starts there closes
 * (`../reply-account.ts` names each case). `end` is where the first
 * complete top-level object ends, as `firstTopLevelJsonObjectEnd` found it.
 */
export function automationStudioDeepSeekContentCase(content: string, end: number | undefined): AutomationStudioLlmProviderReplyAccount["case"] {
  const text = content.trimStart();
  if (text === "") return "content_empty";
  if (text.startsWith("```")) return "content_fenced";
  if (!text.startsWith("{")) return text.includes("{") ? "content_prefixed" : "content_not_object";
  if (end === undefined) return "content_unclosed";
  if (!/^[\s}\]]*$/u.test(content.slice(end))) return "content_trailing";
  return bracketsMismatch(content) ? "content_mismatched" : "content_invalid";
}

/** Whether a bracket outside a string closes the other kind, or closes nothing. */
function bracketsMismatch(content: string): boolean {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of content) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") open.push(char);
    else if (char === "}" || char === "]") {
      if (open.pop() !== (char === "}" ? "{" : "[")) return true;
    }
  }
  return false;
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

/**
 * The refusal of a reply Core could not read, carrying which case it was, its
 * finish reason, its length and what it cost -- never its content. Used by the
 * adapter's call as well, for the two cases it meets before the envelope.
 */
export function automationStudioDeepSeekMalformedReply(reply: AutomationStudioLlmProviderReplyAccount, message = "DeepSeek returned an invalid response envelope."): AutomationStudioLlmProviderError {
  return new AutomationStudioLlmProviderError("llm.provider_malformed_response", message, false, undefined, undefined, undefined, undefined, reply, undefined, reply.usage);
}

function malformed(reply: AutomationStudioLlmProviderReplyAccount, paid: AutomationStudioLlmProviderReplyAccount["usage"]): never {
  throw automationStudioDeepSeekMalformedReply({ ...reply, ...(paid ? { usage: paid } : {}) });
}

/**
 * A refusal of a reply that arrived, carrying what the provider said it cost:
 * Core would not take the reply, but the call was paid for, and the run's
 * ledger and the build's purse charge it at that rather than at its hold.
 */
function refusePaid(code: "llm.provider_output_invalid" | "llm.provider_output_truncated" | "llm.provider_output_padding_truncated" | "llm.provider_usage_invalid" | "llm.provider_usage_limit_exceeded", message: string, paid: AutomationStudioLlmUsageSummary | undefined): never {
  throw new AutomationStudioLlmProviderError(code, message, false, undefined, undefined, undefined, undefined, undefined, undefined, paid);
}

/** The provider's finish reason, where it gave a code-shaped one; the account bounds it again. */
function finishReasonOf(choice: unknown): { finishReason?: string } {
  const reason = isRecord(choice) ? choice.finish_reason : undefined;
  return typeof reason === "string" && /^[a-z0-9_.:-]{1,40}$/i.test(reason) ? { finishReason: reason } : {};
}

/**
 * What a reply cost, read leniently for the account of one Core refused: the
 * same figures and price the accepted path computes, or nothing where the
 * provider's usage does not add up. The accepted path keeps its strict checks.
 */
function replyUsage(value: unknown, model: AutomationStudioDeepSeekModel, sentAtMs: number | undefined): AutomationStudioLlmProviderReplyAccount["usage"] {
  if (!isRecord(value)) return undefined;
  const inputTokens = nonNegativeInteger(value.prompt_tokens);
  const outputTokens = nonNegativeInteger(value.completion_tokens);
  const totalTokens = nonNegativeInteger(value.total_tokens);
  if (inputTokens === undefined || outputTokens === undefined || totalTokens !== inputTokens + outputTokens) return undefined;
  const cacheHitInputTokens = automationStudioDeepSeekCacheHitInputTokens(value, inputTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cacheHitInputTokens === undefined ? {} : { cacheHitInputTokens, cacheMissInputTokens: inputTokens - cacheHitInputTokens }),
    estimatedCostUsd: estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, cacheHitInputTokens ?? 0, model, sentAtMs)
  };
}

/** Usage Core will not account by, with `paid` (the lenient read) where it exists; today both reads ask the same of the counts, so it is normally absent here. */
function usageInvalid(paid: AutomationStudioLlmUsageSummary | undefined): never {
  refusePaid("llm.provider_usage_invalid", "DeepSeek returned invalid token usage.", paid);
}

function usageLimitExceeded(paid: AutomationStudioLlmUsageSummary | undefined): never {
  refusePaid("llm.provider_usage_limit_exceeded", "DeepSeek reported usage above the configured token limits.", paid);
}

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : undefined;
}
