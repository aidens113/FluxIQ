import { describe, expect, it } from "vitest";
import { validateAutomationStudioLlmOutput } from "../output-validation.ts";
import { parseAutomationStudioLlmProviderResult } from "../provider-result.ts";
import { stripAutomationStudioLlmResponseMetadata, summarizeAutomationStudioLlmResponse, type AutomationStudioLlmStructuredResponse } from "../structured-response.ts";

const response = {
  kind: "evidence_tool_decision" as const,
  summary: "Inspect, then fill.",
  decision: {
    kind: "tool_calls" as const,
    calls: [
      { toolId: "inspect", input: {} },
      { toolId: "fill", input: { target: "field.one", value: "bounded" } }
    ]
  }
};

describe("Automation Studio multi-action provider result", () => {
  it("rejects list responses by default without changing singleton parsing", () => {
    const disabled = parseAutomationStudioLlmProviderResult({ response }, "evidence_tool_decision");
    expect(disabled.response).toBeUndefined();
    expect(disabled.diagnostics).toContainEqual(expect.objectContaining({
      code: "llm_output.evidence_batch_disabled",
      path: "response.decision.kind"
    }));

    const singleton = {
      kind: "evidence_tool_decision" as const,
      summary: "Inspect once.",
      decision: { kind: "tool_call" as const, callId: "call.1", toolId: "inspect", input: {} }
    };
    expect(parseAutomationStudioLlmProviderResult({ response: singleton }, "evidence_tool_decision"))
      .toMatchObject({ response: singleton, diagnostics: [] });
  });

  it("accepts only a fully valid enabled list and reports an indexed later failure", () => {
    expect(parseAutomationStudioLlmProviderResult({ response }, "evidence_tool_decision", undefined, {
      maxActionsPerDecision: 16,
      eligibleToolIds: ["inspect", "fill"],
      isInputValid: (toolId, input) => toolId !== "fill" || Object.hasOwn(input, "target")
    })).toMatchObject({ response, diagnostics: [] });

    const refused = parseAutomationStudioLlmProviderResult({
      response: { ...response, decision: { ...response.decision, calls: [response.decision.calls[0], { toolId: "hidden", input: {} }] } }
    }, "evidence_tool_decision", undefined, { maxActionsPerDecision: 16, eligibleToolIds: ["inspect", "fill"] });
    expect(refused.response).toBeUndefined();
    expect(refused.diagnostics).toContainEqual(expect.objectContaining({
      code: "llm_output.ineligible_evidence_tool",
      path: "response.decision.calls.1.toolId"
    }));
  });

  it("keeps only recognized decision fields and summarizes no inputs", () => {
    const withMetadata = { ...response, metadata: { ignored: true } } as AutomationStudioLlmStructuredResponse;
    expect(stripAutomationStudioLlmResponseMetadata(withMetadata)).toEqual(response);
    const summary = summarizeAutomationStudioLlmResponse(response);
    expect(summary).toEqual({
      kind: "evidence_tool_decision",
      decisionKind: "tool_calls",
      actionCount: 2,
      toolIds: ["inspect", "fill"]
    });
    expect(JSON.stringify(summary)).not.toContain("field.one");
    expect(JSON.stringify(summary)).not.toContain("bounded");
  });

  it("validates direct structured responses against the effective bound", () => {
    expect(validateAutomationStudioLlmOutput(response, "evidence_tool_decision"))
      .toContainEqual(expect.objectContaining({ code: "llm_output.evidence_batch_disabled", path: "decision.kind" }));
    expect(validateAutomationStudioLlmOutput(response, "evidence_tool_decision", undefined, { maxActionsPerDecision: 16 })).toEqual([]);
    expect(validateAutomationStudioLlmOutput({
      ...response,
      decision: { ...response.decision, calls: [...response.decision.calls, { toolId: "inspect", input: {} }] }
    }, "evidence_tool_decision", undefined, { maxActionsPerDecision: 2 }))
      .toContainEqual(expect.objectContaining({ code: "llm_output.invalid_evidence_tool_calls", path: "decision.calls" }));
  });
});
