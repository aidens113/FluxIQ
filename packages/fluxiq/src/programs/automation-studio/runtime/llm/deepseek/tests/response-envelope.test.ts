// What a reply Core could not read is recorded as: which malformed case it was,
// the provider's finish reason, the content's length and what the call cost --
// never a word of the reply.
//
// `run-munw7ffn-fe1cecd2`: 14 of the re-author's 35 decisions were refused as
// `llm.provider_malformed_response` and nothing else. Seven places raise that
// code, so the run could not say whether the model was cut off, fenced its JSON,
// answered in prose or broke the object, and the replies were gone. The
// fixture below is the shape those decisions were writing: a `rerun` of an
// `extract_list` step, about 570 output tokens, whose selectors carry escaped
// quotes and whose `where` holds five conditions.

import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { AutomationStudioLlmProviderError, normalizedAutomationStudioLlmProviderFailure } from "../../provider-contract.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, createAutomationStudioDeepSeekProvider, estimateAutomationStudioDeepSeekCostUsd } from "../index.ts";

/** A peak instant, Wednesday 2026-09-30 02:00 UTC: DeepSeek bills calls at their send time, peak or off-peak (t254), and these figures are peak. */
const PEAK_CLOCK = (): number => Date.UTC(2026, 8, 30, 2);

/** Page text a reply may quote, which must never reach an account. */
const PAGE_TEXT = "PRIVATE_PAGE_TEXT charging case";
const CARD = "main > div:nth-of-type(2) > div > div:nth-of-type(1) > div.css-0rc9pnw";
const PRICE = ':scope > div.css-1h13pfs > div[itemprop="offers"] > a.css-1wwnizn > span.css-00egoa7 > span.css-1f32dgn';
const NAME = ":scope > div.css-1h13pfs > h2.css-0lh1x1m > a.css-1ahy6rs > span";

/** A re-author's decision as it was being written: amend step 12 and rerun its read. */
const DECISION = JSON.stringify({
  kind: "amend_draft",
  summary: "Rerun the listing with the accessory filter.",
  amendments: [{
    step: 12,
    change: "rerun",
    input: {
      extractList: {
        item: CARD,
        fields: {
          name: { kind: "text", selector: NAME, required: true },
          price: { kind: "text", selector: PRICE, required: true },
          url: { kind: "link", selector: ":scope > div.css-1h13pfs > h2.css-0lh1x1m > a.css-1ahy6rs", required: true }
        },
        where: [
          { read: { kind: "attribute", attribute: "data-ad-id", required: false }, is: "absent" },
          { read: { kind: "text", selector: NAME, required: true }, contains: ["ear tips", PAGE_TEXT, "replacement"], not: true },
          { read: { kind: "text", selector: PRICE, required: true }, lessThan: 50 }
        ],
        paginate: { next: "main > div:nth-of-type(2) > div > nav > a:nth-of-type(6)", maxPages: 50 },
        minItems: 0,
        dedupe: { by: ["url"] }
      }
    }
  }]
});

/** What `run-munw7ffn-fe1cecd2`'s re-author was billed for a decision of this size. */
const USAGE = { prompt_tokens: 21_424, completion_tokens: 571, total_tokens: 21_995, prompt_cache_hit_tokens: 19_584, prompt_cache_miss_tokens: 1_840 };

describe("the account of a reply Core could not read", () => {
  it.each([
    // Cut inside a string: only brackets short at the end are closed (`../unclosed-content.ts`), and this is not that.
    ["the object never closes", DECISION.slice(0, DECISION.indexOf("replacement") + 4), "content_unclosed"],
    ["prose after the object", `${DECISION}\nThis reruns step 12.`, "content_trailing"],
    ["one brace too many mid-object, so a brace closes the array", DECISION.replace('"maxPages":50}', '"maxPages":50}}'), "content_mismatched"],
    ["a selector's quotes left unescaped", DECISION.replaceAll('\\"offers\\"', '"offers"'), "content_invalid"],
    ["a trailing comma", `${DECISION.slice(0, -1)},}`, "content_invalid"],
    ["a Markdown fence", `\`\`\`json\n${DECISION}\n\`\`\``, "content_fenced"],
    ["words before the object", `Decision: ${DECISION}`, "content_prefixed"],
    ["prose and no object", `I will rerun step 12 to drop the ${PAGE_TEXT} rows.`, "content_not_object"],
    ["nothing", "  \n", "content_empty"]
  ])("names the case when %s", async (_label, content, expected) => {
    const error = await refusal({ choices: [{ finish_reason: "stop", message: { content } }], usage: USAGE });

    expect(error.code).toBe("llm.provider_malformed_response");
    expect(error.reply).toEqual({
      case: expected,
      finishReason: "stop",
      contentChars: content.length,
      usage: { inputTokens: 21_424, outputTokens: 571, totalTokens: 21_995, cacheHitInputTokens: 19_584, cacheMissInputTokens: 1_840, estimatedCostUsd: expect.any(Number) }
    });
    expect(error.reply?.usage?.estimatedCostUsd).toBeGreaterThan(0);
    expectContentFree(error);
  });

  it("names a finish reason Core does not take, with the content's length", async () => {
    const error = await refusal({ choices: [{ finish_reason: "insufficient_system_resource", message: { content: DECISION.slice(0, 900) } }], usage: USAGE });

    expect(error.reply).toMatchObject({ case: "finish_reason", finishReason: "insufficient_system_resource", contentChars: 900, usage: { outputTokens: 571 } });
    expectContentFree(error);
  });

  it("names a choice without content, and an envelope without one choice", async () => {
    expect((await refusal({ choices: [{ finish_reason: "content_filter", message: { content: null } }], usage: USAGE })).reply)
      .toMatchObject({ case: "content_missing", finishReason: "content_filter", usage: { outputTokens: 571 } });
    expect((await refusal({ choices: [], usage: USAGE })).reply).toMatchObject({ case: "envelope_shape", usage: { outputTokens: 571 } });
  });

  it("names the two cases met before the envelope, where there is no usage to read", async () => {
    expect((await refusal("<html>busy</html>", "text/html")).reply).toEqual({ case: "media_type" });
    expect((await refusal(`{"choices":[{"message":{"content":${JSON.stringify(PAGE_TEXT)}`)).reply).toEqual({ case: "envelope_not_json" });
  });

  it("leaves the cost out where the provider's usage does not add up, and still names the case", async () => {
    const error = await refusal({ choices: [{ finish_reason: "stop", message: { content: `${DECISION}x` } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 99 } });
    expect(error.reply).toEqual({ case: "content_trailing", finishReason: "stop", contentChars: DECISION.length + 1 });
  });

  it("travels through the normalizer bounded, and only from a real adapter error", () => {
    const error = new AutomationStudioLlmProviderError("llm.provider_malformed_response", "m", false, undefined, undefined, undefined, undefined,
      { case: "content_invalid", finishReason: "stop", contentChars: 12, content: PAGE_TEXT } as never);
    expect(normalizedAutomationStudioLlmProviderFailure(error).reply).toEqual({ case: "content_invalid", finishReason: "stop", contentChars: 12 });
    const clone = { name: "AutomationStudioLlmProviderError", code: "llm.provider_malformed_response", retryable: false, reply: { case: "content_invalid" } };
    expect(normalizedAutomationStudioLlmProviderFailure(clone).reply).toBeUndefined();
  });

  it("changes nothing about a reply Core can read", async () => {
    const provider = adapter(() => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: DIAGNOSIS } }], usage: USAGE }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(provider.runTask(request())).resolves.toMatchObject({ response: { kind: "diagnosis" }, usage: { outputTokens: 571 } });
  });
});

// `run-muqiojz4-04a7a8fc` step 0108: a 200 whose usage DeepSeek billed at about
// $0.0041 was refused as `llm.provider_output_invalid`, and the run charged the
// call at its $0.0144 hold, because only a malformed reply carried its cost.
describe("what a refused reply cost", () => {
  /** USAGE as the adapter prices it: what every refusal below must carry. */
  const PAID = {
    inputTokens: 21_424, outputTokens: 571, totalTokens: 21_995, cacheHitInputTokens: 19_584, cacheMissInputTokens: 1_840,
    estimatedCostUsd: estimateAutomationStudioDeepSeekCostUsd(21_424, 571, 19_584, AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL)
  };

  it("carries the priced usage on output Core will not take, and through the normalizer", async () => {
    // Well-formed JSON, the wrong answer: a runtime diagnosis that is not a diagnosis.
    const error = await refusal({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "runtime_patch", patches: [] }) } }], usage: USAGE });
    expect(error.code).toBe("llm.provider_output_invalid");
    expect(error.paid).toEqual(PAID);
    expect(PAID.estimatedCostUsd).toBeGreaterThan(0);
    expect(normalizedAutomationStudioLlmProviderFailure(error).paid).toEqual(PAID);
  });

  it.each([
    ["cut off at its limit", { finish_reason: "length", message: { content: DECISION.slice(0, 400) } }, "llm.provider_output_truncated"],
    ["cut off with nothing in it", { finish_reason: "length", message: { content: " " } }, "llm.provider_output_padding_truncated"]
  ])("carries it on a reply %s", async (_label, choice, code) => {
    const error = await refusal({ choices: [choice], usage: USAGE });
    expect(error.code).toBe(code);
    expect(error.paid).toEqual(PAID);
  });

  it("carries it on usage over the request's limits", async () => {
    const over = { prompt_tokens: 60_000, completion_tokens: 571, total_tokens: 60_571 };
    const error = await refusal({ choices: [{ finish_reason: "stop", message: { content: DIAGNOSIS } }], usage: over });
    expect(error.code).toBe("llm.provider_usage_limit_exceeded");
    expect(error.paid).toEqual({ inputTokens: 60_000, outputTokens: 571, totalTokens: 60_571, estimatedCostUsd: estimateAutomationStudioDeepSeekCostUsd(60_000, 571, 0, AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL) });
  });

  it("carries it on a malformed reply as well as in the reply's account", async () => {
    const error = await refusal({ choices: [{ finish_reason: "stop", message: { content: DECISION.slice(0, DECISION.indexOf("replacement") + 4) } }], usage: USAGE });
    expect(error.paid).toEqual(PAID);
    expect(error.reply?.usage).toEqual(PAID);
  });

  it("travels through the normalizer as numbers only, and only from a real adapter error", () => {
    const error = new AutomationStudioLlmProviderError("llm.provider_output_invalid", "m", false, undefined, undefined, undefined, undefined, undefined, undefined,
      { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001, note: PAGE_TEXT, cacheHitInputTokens: -1 } as never);
    expect(normalizedAutomationStudioLlmProviderFailure(error).paid).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 });
    const clone = { name: "AutomationStudioLlmProviderError", code: "llm.provider_output_invalid", retryable: false, paid: { outputTokens: 5, estimatedCostUsd: 0.001 } };
    expect(normalizedAutomationStudioLlmProviderFailure(clone).paid).toBeUndefined();
  });
});

const DIAGNOSIS = JSON.stringify({ kind: "diagnosis", summary: "A bounded diagnosis.", confidence: 0.9 });

function expectContentFree(error: AutomationStudioLlmProviderError): void {
  const published = JSON.stringify({ reply: error.reply, message: error.message, normalized: normalizedAutomationStudioLlmProviderFailure(error) });
  for (const fragment of ["PRIVATE_PAGE_TEXT", "itemprop", "css-", "rerun", "amend_draft"]) expect(published).not.toContain(fragment);
}

async function refusal(body: unknown, contentType = "application/json"): Promise<AutomationStudioLlmProviderError> {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const provider = adapter(() => new Response(text, { status: 200, headers: { "content-type": contentType } }));
  const error = await provider.runTask(request()).then(() => undefined, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(AutomationStudioLlmProviderError);
  return error as AutomationStudioLlmProviderError;
}

function adapter(response: () => Response) {
  return createAutomationStudioDeepSeekProvider({
    now: PEAK_CLOCK,
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl: (async () => response()) as typeof fetch
  });
}

function request(): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "idempotency.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "runtime_diagnosis",
    promptVersion: "automation-studio.runtime-diagnosis.v1",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 },
    maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1",
      taskKind: "runtime_diagnosis",
      promptVersion: "automation-studio.runtime-diagnosis.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 }
    }
  };
}
