// A reply only closing brackets short at its end is closed and read
// (`../unclosed-content.ts`, `../response-envelope.ts`). Lane C
// (`run-mv0fuotv-805294d7`, C3) lost three decisions -- 0017, 0025, 0033 -- to
// DeepSeek flash stopping one `}` short of the root; the fixture is 0017's reply
// as it arrived.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { AutomationStudioLlmProviderError } from "../../provider-contract.ts";
import { parseAutomationStudioDeepSeekEnvelope } from "../response-envelope.ts";
import { automationStudioDeepSeekClosedContent } from "../unclosed-content.ts";

const LIVE = JSON.parse(readFileSync(new URL("./unclosed-reply-0017.json", import.meta.url), "utf8")) as {
  choices: Array<{ finish_reason: string; message: { content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};
const CONTENT = LIVE.choices[0]!.message.content;

const parse = (content: string, finishReason = "stop", taskKind: AutomationStudioLlmTaskRequest["taskKind"] = "evidence_tool_decision") =>
  parseAutomationStudioDeepSeekEnvelope({ choices: [{ finish_reason: finishReason, message: { content } }], usage: LIVE.usage }, request(taskKind), "deepseek-flash");

function refusalOf(run: () => unknown): AutomationStudioLlmProviderError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AutomationStudioLlmProviderError);
    return error as AutomationStudioLlmProviderError;
  }
  throw new Error("expected a refusal");
}

describe("a reply only closing brackets short", () => {
  it("the live reply is one `}` short and does not parse as sent", () => {
    expect(() => JSON.parse(CONTENT)).toThrow();
    expect(LIVE.choices[0]!.finish_reason).toBe("stop");
  });

  it("is closed and read as the decision it was (lane C, 0017)", () => {
    const { response, usage } = parse(CONTENT);
    expect(response).toMatchObject({ kind: "evidence_tool_decision", decision: { kind: "tool_call", callId: "extract-list-2", toolId: "core.run_node", input: { node: "web.output.dom-extract_list" } } });
    expect(usage).toMatchObject({ inputTokens: LIVE.usage.prompt_tokens, outputTokens: LIVE.usage.completion_tokens });
  });

  it("appends exactly the closers still open, innermost first, outside strings", () => {
    expect(automationStudioDeepSeekClosedContent('{"a":[{"b":"} ] {"}')).toBe('{"a":[{"b":"} ] {"}]}');
    expect(automationStudioDeepSeekClosedContent('{"a":{"b":1}  \n')).toBe('{"a":{"b":1}}');
    expect(automationStudioDeepSeekClosedContent(CONTENT)).toBe(`${CONTENT}}`);
  });

  it("is not repaired when the provider stopped at its length limit", () => {
    const error = refusalOf(() => parse(CONTENT, "length"));
    expect(error.code).toBe("llm.provider_output_truncated");
  });

  it("closes nothing cut inside a string, miscounted, or not an object", () => {
    for (const content of ['{"a":"cut', '{"a":[1}', '[{"a":1}', '{"a":1}}{"b":', "prose {"]) {
      expect(automationStudioDeepSeekClosedContent(content), content).toBeUndefined();
    }
    expect(refusalOf(() => parse(CONTENT.slice(0, CONTENT.indexOf("brightaisle_plus") + 4))).reply).toMatchObject({ case: "content_unclosed" });
  });

  it("refuses a closed reply that still does not parse, and validates one that does", () => {
    // Cut after a key's colon: closing it leaves `{"kind":}`, which is still malformed.
    expect(refusalOf(() => parse('{"kind":')).reply).toMatchObject({ case: "content_unclosed", finishReason: "stop" });
    // Parses once closed, but is not a decision: refused as any wrong shape is.
    expect(refusalOf(() => parse('{"kind":"not_a_decision","x":{"y":1}')).code).toBe("llm.provider_output_invalid");
  });
});

function request(taskKind: AutomationStudioLlmTaskRequest["taskKind"]): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "idempotency.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind,
    promptVersion: "automation-studio.evidence-tool-decision.v1",
    expectedOutput: taskKind,
    tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 },
    maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1",
      taskKind,
      promptVersion: "automation-studio.evidence-tool-decision.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 }
    }
  } as AutomationStudioLlmTaskRequest;
}
