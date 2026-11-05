import { describe, expect, it, vi } from "vitest";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { automationStudioLlmUnreadableReplySaid } from "../../../models/failures/index.ts";
import { decisionRequest, streamReply, USAGE } from "./fixtures.ts";

// The shape a long amend decision has in the JSON-text transport: a one-key
// envelope whose result_json holds the decision as text, nested quotes escaped.
const DECISION = { kind: "evidence_tool_decision", summary: "Fix the saved step.", decision: { kind: "tool_call", callId: "inspect.one", toolId: "core.inspect_values", input: { parameters: { label: 'A "quoted" label' } } } };
const inner = JSON.stringify(DECISION);
const wrap = (resultJson: unknown) => JSON.stringify({ result_json: resultJson });
const provider = (text: string, stop = "end_turn") => createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: vi.fn(async () => streamReply(text, stop)) as typeof fetch });

describe("an Anthropic reply Core can read after undoing damage that adds nothing", () => {
  it.each([
    ["a Markdown fence inside result_json", wrap("```json\n" + inner + "\n```")],
    ["a surplus closing bracket after the object", wrap(inner + "}")],
    ["one closing brace short at the end", wrap(inner.slice(0, -1))],
    ["the object itself where its text was asked for", wrap(DECISION)],
    ["the answer encoded twice", wrap(JSON.stringify(inner))],
    ["whitespace around the envelope", "\n  " + wrap(inner) + "\n"]
  ])("reads %s as the real decision and bills the call once", async (_name, text) => {
    const result = await provider(text).runTask(decisionRequest()) as { response: unknown; usage: unknown };
    expect(result.response).toEqual(DECISION);
    expect(result.usage).toMatchObject({ outputTokens: 30, totalTokens: 200 });
  });
});

describe("an Anthropic reply Core cannot read", () => {
  it.each([
    ["an unescaped quote inside result_json", wrap('{"kind":"evidence_tool_decision","summary":"Fix "the" step","decision":{}}'), "content_invalid"],
    ["prose before the object", wrap("Here is the decision: " + inner), "content_prefixed"],
    ["prose after the object", wrap(inner + " Hope that helps."), "content_trailing"],
    ["text that is no object", wrap("no decision"), "content_not_object"],
    ["a result_json that is a number", wrap(7), "envelope_shape"],
    ["an envelope with another key", JSON.stringify({ result_json: inner, note: "x" }), "envelope_shape"],
    ["only whitespace in result_json", wrap("  "), "content_empty"]
  ])("refuses %s as malformed, says which case, and bills the call", async (_name, text, expected) => {
    const failure = await provider(text).runTask(decisionRequest()).then(() => undefined, (error: unknown) => error as { code: string; reply?: { case: string; finishReason?: string; contentChars?: number; usage?: { outputTokens?: number } }; paid?: { outputTokens?: number } });
    expect(failure?.code).toBe("llm.provider_malformed_response");
    expect(failure?.reply).toMatchObject({ case: expected, finishReason: "end_turn", usage: { outputTokens: 30 } });
    expect(failure?.reply?.contentChars).toBeGreaterThanOrEqual(0);
    expect(failure?.paid).toMatchObject({ outputTokens: 30 });
    // What the model is told is the case in words, never the reply.
    expect(automationStudioLlmUnreadableReplySaid({ case: failure?.reply?.case })).not.toBe("it could not be read");
  });

  it("names a reply with no text, only thinking, as empty rather than leaving it unexplained", async () => {
    const failure = await provider("", "end_turn").runTask(decisionRequest()).then(() => undefined, (error: unknown) => error as { code: string; reply?: { case: string }; paid?: { outputTokens?: number } });
    expect(failure).toMatchObject({ code: "llm.provider_malformed_response", reply: { case: "content_empty" }, paid: { outputTokens: 30 } });
    expect(USAGE.output_tokens).toBe(30);
  });

  it("never lowers or caps the output limit when a reply is unreadable", async () => {
    const fetchImpl = vi.fn(async () => streamReply(wrap("nope")));
    const adapter = createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: fetchImpl as typeof fetch });
    await adapter.runTask(decisionRequest()).catch(() => undefined);
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).max_tokens).toBe(128_000);
  });
});
