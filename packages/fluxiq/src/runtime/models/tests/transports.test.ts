import { describe, expect, it } from "vitest";
import { automationStudioAnthropicMessage } from "../providers/anthropic/index.ts";
import { automationStudioDeepSeekCompletion, parseAutomationStudioDeepSeekEnvelope } from "../providers/deepseek/index.ts";
import type { ModelTransportObserver } from "../transport/index.ts";

const model = "claude-sonnet-5-5" as const;
const secret = "mock-model-key-only";
const usage = { input_tokens: 100, output_tokens: 30 };

function observer(events: string[]): ModelTransportObserver {
  return (call) => {
    events.push(`sent:${call.body}`);
    return { reply: () => { events.push("reply"); }, succeeded: () => { events.push("succeeded"); }, failed: () => { events.push("failed"); } };
  };
}

describe("canonical provider transports with program policy injected", () => {
  it("sends the exact Anthropic body and calls the supplied reader and observer", async () => {
    const events: string[] = [];
    const body = '{"messages":[{"role":"user","content":"Read the supplied record."}]}';
    const response = await automationStudioAnthropicMessage({
      body, model, timeoutMs: 1000, maxResponseBytes: 10_000, taskKind: "record_review", resolveKey: async () => secret,
      screenMessage: (value) => value,
      observe: observer(events),
      fetchImpl: async (_url, input) => {
        expect(input?.body).toBe(body);
        expect(input?.redirect).toBe("manual");
        return new Response(JSON.stringify({ type: "message", role: "assistant", model, stop_reason: "end_turn", content: [{ type: "text", text: '{"accepted":true}' }], usage }), { headers: { "content-type": "application/json" } });
      },
      readAnswer: (text, billed) => {
        expect(billed).toMatchObject({ inputTokens: 100, outputTokens: 30, totalTokens: 130 });
        return JSON.parse(text) as { accepted: boolean };
      }
    });
    expect(response.response).toEqual({ accepted: true });
    expect(events).toEqual([`sent:${body}`, "reply", "succeeded"]);
  });

  it("retains DeepSeek wire bytes, idempotency and billed usage with a generic response reader", async () => {
    const body = '{"messages":[{"role":"user","content":"Review the supplied record."}]}';
    const events: string[] = [];
    const response = await automationStudioDeepSeekCompletion({
      body, model: "deepseek-flash", timeoutMs: 1000, maxResponseBytes: 10_000, now: () => 0,
      requestId: "record.request", idempotencyKey: "record.request", taskKind: "record_review",
      resolveKey: async () => secret, screenMessage: (value) => value, requestShape: () => ({ bodyBytes: body.length }), observe: observer(events),
      fetchImpl: async (_url, input) => {
        expect(input?.body).toBe(body);
        expect((input?.headers as Record<string, string>)["idempotency-key"]).toBe("record.request");
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"accepted":true}' } }], usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 } }), { headers: { "content-type": "application/json" } });
      },
      readEnvelope: (value, sentAtMs) => parseAutomationStudioDeepSeekEnvelope(value, { tokenLimits: { maxInputTokens: 1000, maxOutputTokens: 100, maxTotalTokens: 1100 } }, "deepseek-flash", sentAtMs, { readResponse: (result) => result })
    });
    expect(response.response).toEqual({ accepted: true });
    expect(response.usage).toMatchObject({ inputTokens: 100, outputTokens: 30, totalTokens: 130 });
    expect(events).toEqual([`sent:${body}`, "reply", "succeeded"]);
  });

  it("uses the injected refusal screen while retaining the typed refusal and paid-failure boundary", async () => {
    await expect(automationStudioAnthropicMessage({
      body: "{}", model, timeoutMs: 1000, maxResponseBytes: 10_000, taskKind: "record_review", resolveKey: async () => secret,
      screenMessage: (value) => value.replace("private label", "[withheld]"),
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "invalid private label", type: "invalid_request" } }), { status: 400, headers: { "content-type": "application/json" } }),
      readAnswer: (text) => text
    })).rejects.toMatchObject({ code: "llm.provider_http_error", retryable: false, refusal: { error: { message: "invalid [withheld]" }, withheld: ["message_locator_shaped"] } });
  });
});
