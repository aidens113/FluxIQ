// Run-mw3itjcy step 67's shape, keys only: a sound decision under its inner object's word is accepted.
import { describe, expect, it } from "vitest";
import { automationStudioAnthropicTaskAnswer } from "../task-answer.ts";
import { decisionRequest } from "./fixtures.ts";

describe("a decision under the wrong outer word", () => {
  it("is accepted", () => {
    const reply = { kind: "tool_call", summary: "s", decision: { kind: "tool_call", callId: "inspect.one", toolId: "core.inspect_values", input: { parameters: {} } } };
    const got = automationStudioAnthropicTaskAnswer(reply, decisionRequest(), { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, 100) as { kind: string };
    expect(got.kind).toBe("evidence_tool_decision");
  });
});
