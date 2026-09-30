// What a reply Core could not read looked like, without a word of what it said.
//
// `llm.provider_malformed_response` is raised from seven places in the DeepSeek
// adapter alone -- a media type, an envelope that is not JSON, one without a
// single choice, a choice with no content, a finish reason Core does not take,
// and content that is not one JSON object -- and one code for all of them is
// what left `run-munw7ffn-fe1cecd2` unreadable: 14 of its re-author's 35
// decisions were refused with that code and nothing else, so nobody could say
// whether the model was cut off, answered in prose, fenced its JSON or broke
// it. That run's replies are gone, and the cause with them.
//
// So the adapter says which case it was, the finish reason the provider gave,
// how long the content was and what the provider says the reply cost. Never the
// content: a case is a word from the closed list below, a finish reason is a
// code-shaped word, and the rest are counts.

import type { AutomationStudioLlmUsageSummary } from "./harness.ts";

/**
 * Every way a reply can fail to be read, in the order the adapter meets them.
 *
 * The `content_` cases are read from the text's structure only -- where its
 * first `{` is and whether its brackets close -- so the case says what kind of
 * damage it was without the reply leaving the adapter:
 *
 * - `content_empty`: nothing but whitespace.
 * - `content_fenced`: a Markdown code fence before the object.
 * - `content_prefixed`: other text before the first `{`.
 * - `content_not_object`: no `{` at all -- a bare string, number or array.
 * - `content_unclosed`: the object never closes; the reply stopped inside it.
 * - `content_trailing`: one complete object, then text or a second value.
 * - `content_mismatched`: the brackets count out, but one closes the other
 *   kind -- a surplus `}` inside an array, or one `}` too many mid-object and
 *   one too few at the end. The model miscounted its brackets.
 * - `content_invalid`: the brackets count out and match, nothing but closers
 *   trails, and it still does not parse -- a bad escape, an unescaped quote, a
 *   trailing comma, an unquoted key.
 */
const REPLY_CASES = [
  "media_type",
  "envelope_not_json",
  "envelope_shape",
  "content_missing",
  "finish_reason",
  "content_empty",
  "content_fenced",
  "content_prefixed",
  "content_not_object",
  "content_unclosed",
  "content_trailing",
  "content_mismatched",
  "content_invalid"
] as const;

export type AutomationStudioLlmProviderReplyCase = (typeof REPLY_CASES)[number];

/** A reply Core could not read, as far as it can be described without its content. */
export type AutomationStudioLlmProviderReplyAccount = {
  case: AutomationStudioLlmProviderReplyCase;
  /** The provider's own word for why it stopped, where it gave a code-shaped one. */
  finishReason?: string;
  /** The content's length in UTF-16 code units, where there was string content. */
  contentChars?: number;
  /** What the provider reported the call cost, where its usage was well formed. The call was paid for either way. */
  usage?: AutomationStudioLlmUsageSummary;
};

const FINISH_REASON = /^[a-z0-9_.:-]{1,40}$/i;
const USAGE_FIELDS = ["inputTokens", "outputTokens", "totalTokens", "cacheHitInputTokens", "cacheMissInputTokens"] as const;

/**
 * The account, bounded: every member checked against its shape and anything
 * else left behind, or `undefined` when the value is not an account at all.
 * Read wherever an account crosses a boundary, so a value built by anything but
 * an adapter cannot carry text out on the strength of a field name.
 */
export function automationStudioLlmProviderReplyAccount(value: unknown): AutomationStudioLlmProviderReplyAccount | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!REPLY_CASES.includes(record.case as AutomationStudioLlmProviderReplyCase)) return undefined;
  const usage = boundedUsage(record.usage);
  return {
    case: record.case as AutomationStudioLlmProviderReplyCase,
    ...(typeof record.finishReason === "string" && FINISH_REASON.test(record.finishReason) ? { finishReason: record.finishReason } : {}),
    ...(Number.isSafeInteger(record.contentChars) && (record.contentChars as number) >= 0 ? { contentChars: record.contentChars as number } : {}),
    ...(usage ? { usage } : {})
  };
}

function boundedUsage(value: unknown): AutomationStudioLlmUsageSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const usage: AutomationStudioLlmUsageSummary = {};
  for (const field of USAGE_FIELDS) {
    const count = record[field];
    if (Number.isSafeInteger(count) && (count as number) >= 0) usage[field] = count as number;
  }
  const cost = record.estimatedCostUsd;
  if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) usage.estimatedCostUsd = cost;
  return usage.outputTokens === undefined ? undefined : usage;
}
