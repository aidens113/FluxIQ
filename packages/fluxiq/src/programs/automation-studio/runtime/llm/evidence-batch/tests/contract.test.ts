import { describe, expect, it } from "vitest";
import { parseAutomationStudioLlmEvidenceBatchDecision } from "../decision.ts";
import { buildAutomationStudioLlmEvidenceBatchDecisionSchema } from "../schema.ts";

const tools = [
  {
    toolId: "inspect",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    toolId: "fill",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["target", "value"],
      properties: { target: { type: "string" }, value: { type: "string" } }
    }
  }
];

describe("Automation Studio multi-action evidence decision contract", () => {
  it("is unavailable at the effective default of one action", () => {
    expect(buildAutomationStudioLlmEvidenceBatchDecisionSchema(tools)).toBeUndefined();
    expect(parseAutomationStudioLlmEvidenceBatchDecision({
      kind: "tool_calls",
      calls: [{ toolId: "inspect", input: {} }, { toolId: "inspect", input: {} }]
    })).toEqual({ ok: false, issues: [{ reason: "disabled", field: "kind" }] });
  });

  it("uses every tool's closed input schema for every list item", () => {
    const schema = buildAutomationStudioLlmEvidenceBatchDecisionSchema(tools, 16) as {
      properties: { calls: { minItems: number; maxItems: number; items: { oneOf: unknown[] } } };
    };
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["kind", "calls"],
      properties: {
        kind: { const: "tool_calls" },
        calls: { type: "array", minItems: 2, maxItems: 16 }
      }
    });
    expect(schema.properties.calls.items.oneOf).toEqual(tools.map((tool) => ({
      type: "object",
      additionalProperties: false,
      required: ["toolId", "input"],
      properties: { toolId: { const: tool.toolId }, input: tool.inputSchema }
    })));
  });

  it("returns a complete canonical decision only after all calls pass", () => {
    const value = {
      kind: "tool_calls",
      calls: [
        { toolId: "inspect", input: {} },
        { toolId: "fill", input: { target: "field.one", value: "bounded" } }
      ]
    };
    const parsed = parseAutomationStudioLlmEvidenceBatchDecision(value, {
      maxActionsPerDecision: 16,
      eligibleToolIds: tools.map((tool) => tool.toolId),
      isInputValid: (toolId, input) => toolId !== "fill" || Object.keys(input).sort().join(",") === "target,value"
    });
    expect(parsed).toEqual({ ok: true, decision: value });
    if (parsed.ok) expect(parsed.decision.calls[1]!.input).not.toBe(value.calls[1]!.input);
  });

  it("rejects the whole decision when a later action is ineligible or invalid", () => {
    const ineligible = parseAutomationStudioLlmEvidenceBatchDecision({
      kind: "tool_calls",
      calls: [{ toolId: "inspect", input: {} }, { toolId: "hidden", input: {} }]
    }, { maxActionsPerDecision: 16, eligibleToolIds: ["inspect"] });
    expect(ineligible).toEqual({ ok: false, issues: [{ reason: "ineligible_tool", index: 1, field: "toolId" }] });

    const invalid = parseAutomationStudioLlmEvidenceBatchDecision({
      kind: "tool_calls",
      calls: [{ toolId: "inspect", input: {} }, { toolId: "fill", input: {} }]
    }, { maxActionsPerDecision: 16, eligibleToolIds: ["inspect", "fill"], isInputValid: (toolId) => toolId !== "fill" });
    expect(invalid).toEqual({ ok: false, issues: [{ reason: "invalid_input", index: 1, field: "input" }] });
  });

  it("rejects aliases, extra fields, singleton lists, and limits above sixteen", () => {
    expect(parseAutomationStudioLlmEvidenceBatchDecision({
      kind: "tool_calls", actions: [{ toolId: "inspect", input: {} }, { toolId: "inspect", input: {} }]
    }, { maxActionsPerDecision: 16 })).toEqual({ ok: false, issues: [{ reason: "invalid_decision" }] });
    expect(parseAutomationStudioLlmEvidenceBatchDecision({
      kind: "tool_calls", calls: [{ toolId: "inspect", input: {}, callId: "model.id" }, { toolId: "inspect", input: {} }]
    }, { maxActionsPerDecision: 16 })).toEqual({ ok: false, issues: [{ reason: "invalid_call", index: 0 }] });
    expect(parseAutomationStudioLlmEvidenceBatchDecision({
      kind: "tool_calls", calls: [{ toolId: "inspect", input: {} }]
    }, { maxActionsPerDecision: 16 })).toEqual({ ok: false, issues: [{ reason: "invalid_count", field: "calls" }] });
    expect(buildAutomationStudioLlmEvidenceBatchDecisionSchema(tools, 17)).toBeUndefined();
    expect(parseAutomationStudioLlmEvidenceBatchDecision({ kind: "tool_calls", calls: [] }, { maxActionsPerDecision: 17 }))
      .toEqual({ ok: false, issues: [{ reason: "invalid_limit" }] });
  });
});
