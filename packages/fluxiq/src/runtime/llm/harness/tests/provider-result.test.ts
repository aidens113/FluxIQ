// What a provider's evidence decision may carry on a tool call: the loop reads
// `add`, `act` and `place` strictly (`../../evidence-loop-decision.ts`), so the
// provider check must let each through and still refuse anything else.
// `place` is D phase 2: the places on the named route a step is on.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioLlmProviderResult } from "../index.ts";

const decided = (decision: Record<string, unknown>) => parseAutomationStudioLlmProviderResult({
  response: { kind: "evidence_tool_decision", summary: "Press Friends.", decision: { kind: "tool_call", callId: "call.1", toolId: "press", input: { target: "t1" }, ...decision } }
}, "evidence_tool_decision");

describe("a provider's tool call", () => {
  it("carries the places on the named route its step is on", () => {
    const result = decided({ add: true, act: "a1", place: "r1,r2" });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm_output.unexpected_field");
    expect(result.response).toMatchObject({ kind: "evidence_tool_decision", decision: { kind: "tool_call", place: "r1,r2" } });
  });

  it("is still refused with a field the loop does not read", () => {
    const result = decided({ place: "r1", waypoint: "r1" });
    expect(result.response).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.unexpected_field");
  });
});
