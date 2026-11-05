// What a call's observer is told of the cache: the writes too, which the usage summary
// every other reader holds has no field for. The step log records them (t869).
import { describe, expect, it, vi } from "vitest";
import { automationStudioAnthropicMessage } from "../messages.ts";

const reply = (usage: Record<string, unknown>) => new Response(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "{\"ok\":true}" }], stop_reason: "end_turn", usage }), { status: 200, headers: { "content-type": "application/json" } });

async function observedUsage(usage: Record<string, unknown>): Promise<{ observed: unknown; returned: unknown }> {
  const succeeded = vi.fn();
  const { usage: returned } = await automationStudioAnthropicMessage({
    body: "{}", model: "claude-sonnet-5-5", timeoutMs: 1_000, maxResponseBytes: 100_000, taskKind: "evidence_tool_decision",
    fetchImpl: (async () => reply(usage)) as typeof fetch,
    resolveKey: async () => "test-key",
    screenMessage: (value) => value,
    observe: () => ({ reply: () => undefined, succeeded, failed: () => undefined }),
    readAnswer: (text) => JSON.parse(text) as unknown
  });
  return { observed: succeeded.mock.calls[0]![1], returned };
}

describe("a call's observed usage", () => {
  it("carries what the reply wrote to the cache, and the summary stays as every other reader holds it", async () => {
    const { observed, returned } = await observedUsage({ input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 50, cache_creation_input_tokens: 20 });
    expect(observed).toMatchObject({ inputTokens: 170, cacheHitInputTokens: 50, cacheMissInputTokens: 120, cacheWriteInputTokens: 20 });
    expect(returned).not.toHaveProperty("cacheWriteInputTokens");
  });

  it("says none were written when the reply wrote none", async () => {
    expect((await observedUsage({ input_tokens: 100, output_tokens: 30 })).observed).toMatchObject({ cacheWriteInputTokens: 0 });
  });
});
