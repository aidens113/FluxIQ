import { describe, expect, it, vi } from "vitest";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_MESSAGES_URL, AUTOMATION_STUDIO_ANTHROPIC_API_VERSION } from "../messages.ts";
import { automationStudioAnthropicRequest } from "../request.ts";
import { DIAGNOSIS, USAGE, request, decisionRequest, textFor, envelope, jsonReply, streamReply } from "./fixtures.ts";

function provider(response: () => Response = streamReply, extra: Partial<Parameters<typeof createAutomationStudioAnthropicProvider>[0]> = {}) {
  return createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: vi.fn(async () => response()) as typeof fetch, ...extra });
}

describe("native Anthropic task provider", () => {
  it("uses the current native API, opaque per-call key, full native streaming output and unchanged task guidance", async () => {
    const secrets = vi.fn(async () => "dummy-provider-key");
    const fetchImpl = vi.fn(async () => streamReply(textFor({ ...DIAGNOSIS, summary: "A useful résumé." })));
    const adapter = provider(streamReply, { resolveSecret: secrets, fetchImpl: fetchImpl as typeof fetch });
    const result = await adapter.runTask(request());
    expect(result).toMatchObject({ response: { kind: "diagnosis", summary: "A useful résumé." }, usage: { inputTokens: 170, outputTokens: 30, totalTokens: 200, cacheHitInputTokens: 50, cacheMissInputTokens: 120, estimatedCostUsd: 0.000555 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(AUTOMATION_STUDIO_ANTHROPIC_MESSAGES_URL);
    expect(init.redirect).toBe("manual");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer dummy-provider-key");
    expect(new Headers(init.headers).get("anthropic-version")).toBe(AUTOMATION_STUDIO_ANTHROPIC_API_VERSION);
    const wire = JSON.parse(String(init.body));
    expect(wire).toMatchObject({ model: "claude-sonnet-5-5", stream: true, max_tokens: 128_000, output_config: { format: { type: "json_schema" } }, cache_control: { type: "ephemeral" } });
    expect(wire).not.toHaveProperty("temperature");
    expect(wire).not.toHaveProperty("thinking");
    expect(wire.system[0].text).toContain("Return exactly one JSON object matching the requested expectedOutput.");
    expect(JSON.parse(wire.messages[0].content).outputSchema.properties.kind).toEqual({ const: "diagnosis" });
    expect(secrets).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", secretReference: "secret:claude", purpose: "llm_provider_request", requestId: "request.one", projectId: "project.one", flowId: "flow.one" }));
    expect(String(init.body)).not.toContain("dummy-provider-key");
    const measured = automationStudioAnthropicRequest(request(), "claude-sonnet-5-5");
    expect(adapter.measureInput!(request())).toEqual({ estimatedInputBytes: measured.estimatedInputBytes, estimatedInputTokens: measured.estimatedInputTokens });
  });

  it("preserves nonempty nested arbitrary maps in a generic evidence decision", async () => {
    const task = decisionRequest();
    const decision = { kind: "evidence_tool_decision", summary: "Inspect the fields.", decision: { kind: "tool_call", callId: "inspect.one", toolId: "core.inspect_values", input: { parameters: { sample: { label: "West room", options: { enabled: true, positions: [2, 4] } } } } } };
    expect(automationStudioAnthropicRequest(task, "claude-sonnet-5-5").format.jsonText).toBe(true);
    const result = await provider(() => streamReply(textFor(decision, task))).runTask(task);
    expect(result).toMatchObject({ response: decision });
  });

  it.each([
    ["max_tokens", "llm.provider_output_truncated"], ["model_context_window_exceeded", "llm.provider_output_truncated"],
    ["refusal", "llm.provider_output_invalid"], ["tool_use", "llm.provider_output_invalid"]
  ])("refuses %s and preserves billed usage", async (stop, code) => {
    await expect(provider(() => streamReply(textFor(DIAGNOSIS), stop)).runTask(request())).rejects.toMatchObject({ code, paid: { inputTokens: 170, estimatedCostUsd: 0.000555 } });
  });

  it.each(["not JSON", '{"result_json":"not JSON"}', '{"result_json":"{}","extra":true}']) ("refuses malformed transport JSON while charging the paid call: %s", async (text) => {
    await expect(provider(() => streamReply(text)).runTask(request())).rejects.toMatchObject({ code: "llm.provider_malformed_response", paid: { outputTokens: 30 } });
  });

  it("enforces the original schema after decoding instead of trusting native structure", async () => {
    await expect(provider(() => streamReply(textFor({ ...DIAGNOSIS, confidence: 4 }))).runTask(request())).rejects.toMatchObject({ code: "llm.provider_output_invalid", paid: { outputTokens: 30 } });
  });

  it("sends a near-window prompt whole with native output maximum and accounts a context stop as paid truncation", async () => {
    // Claude 4.5+ accepts input + max_tokens above its window. It stops with
    // model_context_window_exceeded if the generated reply reaches the window:
    // https://platform.claude.com/docs/en/build-with-claude/context-windows
    const base = request();
    const padding = "x".repeat(2_700_000);
    const task = request({ maxEstimatedCostUsd: 5, context: { ...base.context, metadata: { padding } } });
    const measured = automationStudioAnthropicRequest(task, "claude-sonnet-5-5");
    expect(measured.estimatedInputTokens + 128_000).toBeGreaterThan(1_000_000);
    expect(measured.estimatedInputTokens + 8_000).toBeLessThan(1_000_000);
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const wire = JSON.parse(String(init?.body));
      expect(wire.max_tokens).toBe(128_000);
      expect(JSON.parse(wire.messages[0].content).context.metadata.padding).toBe(padding);
      return streamReply(textFor(DIAGNOSIS), "model_context_window_exceeded", { input_tokens: 900_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } });
    });
    await expect(provider(streamReply, { fetchImpl: fetchImpl as typeof fetch }).runTask(task)).rejects.toMatchObject({ code: "llm.provider_output_truncated", paid: { inputTokens: 900_000, outputTokens: 100_000, totalTokens: 1_000_000, estimatedCostUsd: 2.8 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const oversized = request({ context: { ...base.context, metadata: { padding: "x".repeat(3_100_000) } } });
    await expect(provider(streamReply, { fetchImpl: fetchImpl as typeof fetch }).runTask(oversized)).rejects.toMatchObject({ code: "llm.provider_input_budget_exceeded" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not cap a reply at the harness's 8k reservation", async () => {
    await expect(provider(() => streamReply(textFor(DIAGNOSIS), "end_turn", { ...USAGE, output_tokens: 9_000 })).runTask(request())).resolves.toMatchObject({ usage: { outputTokens: 9_000 } });
  });

  it("accounts total context including both cache categories and rejects bad counts", async () => {
    await expect(provider(() => jsonReply(envelope(undefined, { usage: { ...USAGE, cache_read_input_tokens: -1 } }))).runTask(request())).rejects.toMatchObject({ code: "llm.provider_usage_invalid" });
    await expect(provider(() => jsonReply(envelope(undefined, { usage: { ...USAGE, input_tokens: 1_000_000 } }))).runTask(request())).rejects.toMatchObject({ code: "llm.provider_usage_limit_exceeded", paid: { inputTokens: 1_000_070 } });
  });

  it.each([[401, "Invalid key", "llm.provider_auth_failed", false], [429, "Slow down", "llm.provider_rate_limited", true], [529, "Overloaded", "llm.provider_http_error", true], [400, "Your credit balance is too low to access the API", "llm.provider_balance_exhausted", false]])("screens and classifies HTTP %s", async (status, message, code, retryable) => {
    await expect(provider(() => jsonReply({ error: { type: "invalid_request_error", message } }, status)).runTask(request())).rejects.toMatchObject({ code, retryable, refusal: { status, error: { message } } });
  });

  it("withholds credential echoes and locator-shaped text from provider refusals", async () => {
    const failed = provider(() => jsonReply({ error: { type: "invalid_request_error", message: "dummy-provider-key is bad" } }, 400));
    await expect(failed.runTask(request())).rejects.toMatchObject({ refusal: { error: { message: null }, withheld: ["message_credential_shaped"] } });
    const located = await provider(() => jsonReply({ error: { message: "Bad #private-node selector" } }, 400)).runTask(request()).catch((error: unknown) => error);
    expect(JSON.stringify(located)).not.toContain("#private-node");
  });

  it("refuses credential echoes before a response can be logged or returned", async () => {
    await expect(provider(() => streamReply(textFor({ ...DIAGNOSIS, summary: "dummy-provider-key" }))).runTask(request())).rejects.toMatchObject({ code: "llm.provider_output_invalid", paid: { outputTokens: 30 } });
  });

  it("rejects redirects, byte overflow and incomplete streams", async () => {
    await expect(provider(() => new Response(null, { status: 302 })).runTask(request())).rejects.toMatchObject({ code: "llm.provider_redirect_rejected" });
    await expect(provider(streamReply, { maxResponseBytes: 100 }).runTask(request())).rejects.toMatchObject({ code: "llm.provider_response_oversize" });
    await expect(provider(() => streamReply(textFor(DIAGNOSIS), "end_turn", USAGE, false)).runTask(request())).rejects.toMatchObject({ code: "llm.provider_malformed_response", paid: { outputTokens: 30 } });
  });

  it("ends stalled fetch, key resolution and response reads at the request deadline", async () => {
    const never = () => new Promise<Response>(() => undefined);
    await expect(provider(streamReply, { fetchImpl: never as typeof fetch }).runTask(request({ timeoutMs: 20 }))).rejects.toMatchObject({ code: "llm.provider_timeout" });
    await expect(provider(streamReply, { resolveSecret: () => new Promise(() => undefined) }).runTask(request({ timeoutMs: 20 }))).rejects.toMatchObject({ code: "llm.provider_timeout" });
    const stalled = new Response(new ReadableStream({ pull() {} }), { headers: { "content-type": "text/event-stream" } });
    await expect(provider(() => stalled).runTask(request({ timeoutMs: 20 }))).rejects.toMatchObject({ code: "llm.provider_timeout" });
  });

  it("honors parent cancellation without resolving a different key or provider", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => streamReply());
    await expect(provider(streamReply, { fetchImpl: fetchImpl as typeof fetch }).runTask(request(), { signal: controller.signal })).rejects.toMatchObject({ code: "llm.provider_aborted" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
