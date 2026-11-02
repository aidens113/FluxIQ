import type { AutomationStudioLlmUsageSummary } from "../../contracts/index.ts";
import type { AutomationStudioLlmTokenLimits } from "../../limits/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProviderReplyAccount } from "../../failures/index.ts";
import { isRecord } from "../../transport/index.ts";
import type { AutomationStudioDeepSeekModel } from "../../catalog/index.ts";
import { automationStudioDeepSeekCacheHitInputTokens, estimateAutomationStudioDeepSeekCostUsd } from "./pricing.ts";
import { automationStudioDeepSeekClosedContent } from "./unclosed-content.ts";

/** A task adapter interprets structured content; the provider owns envelope, token usage and billing. */
export type DeepSeekResponseAdapter<Response> = {
  readResponse(value: unknown, paid: AutomationStudioLlmUsageSummary | undefined, truncated: boolean): Response;
  readTruncatedContent?(content: string): Record<string, unknown> | undefined;
};

/** The answer and what it cost, read out of the reply the provider sent. */
export function parseAutomationStudioDeepSeekEnvelope<Response>(
  value: unknown,
  request: { tokenLimits: AutomationStudioLlmTokenLimits },
  model: AutomationStudioDeepSeekModel,
  /** When the call was sent, in epoch milliseconds: what DeepSeek bills it at, peak or off-peak (`./pricing.ts`). Absent, the peak rate. */
  sentAtMs: number | undefined,
  adapter: DeepSeekResponseAdapter<Response>
): { response: Response; usage: AutomationStudioLlmUsageSummary } {
  // What the reply cost is read before anything can refuse it: a reply Core
  // cannot use was still paid for, and its account says so.
  const paid = isRecord(value) ? replyUsage(value.usage, model, sentAtMs) : undefined;
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length !== 1) malformed({ case: "envelope_shape" }, paid);
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) malformed({ case: "envelope_shape", ...finishReasonOf(choice) }, paid);
  if (typeof choice.message.content !== "string") malformed({ case: "content_missing", ...finishReasonOf(choice) }, paid);
  // A result verification cut off after its diagnosis closed still gave its
  // verdict, and only that is read (t653, `./verdict-before-cut.ts`); every
  // other cut reply is refused as before, and is asked again by its caller.
  let cutAfterVerdict: Record<string, unknown> | undefined;
  if (choice.finish_reason === "length") {
    if (choice.message.content.trim() === "") {
      refusePaid("llm.provider_output_padding_truncated", "DeepSeek reached the configured output-token limit without substantive content.", paid);
    }
    cutAfterVerdict = adapter.readTruncatedContent?.(choice.message.content);
    if (!cutAfterVerdict) refusePaid("llm.provider_output_truncated", "DeepSeek stopped at the configured output-token limit.", paid);
  } else if (choice.finish_reason !== "stop") malformed({ case: "finish_reason", ...finishReasonOf(choice), contentChars: choice.message.content.length }, paid);
  const structured = cutAfterVerdict ?? parseDeepSeekJsonContent(choice.message.content, paid);
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
    response: adapter.readResponse(structured, paid, cutAfterVerdict !== undefined),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      ...(cacheHitInputTokens === undefined ? {} : { cacheHitInputTokens, cacheMissInputTokens: inputTokens - cacheHitInputTokens }),
      estimatedCostUsd: estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, cacheHitInputTokens ?? 0, model, sentAtMs)
    }
  };
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
