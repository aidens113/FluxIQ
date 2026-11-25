// D12 (t1038): an evidence decision's schema as one provider tool per variant, and a tool call read back into exactly
// the wrapper the loop reads. Provider-neutral: no wire, no model.
import { describe, expect, it } from "vitest";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../evidence-loop.ts";
import { automationStudioLlmDecisionFromToolCall, automationStudioLlmDecisionToolName, automationStudioLlmDecisionTools } from "../index.ts";

const TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "core.run_node", description: "Run one node.", effect: "mutate", inputSchema: { type: "object", additionalProperties: false, required: ["node"], properties: { node: { enum: ["a.press", "a.type"] }, parameters: { type: "object" }, act: { type: "string" } } } },
  { toolId: "web.read_list", description: "Read a list.", effect: "observe", inputSchema: { type: "object", additionalProperties: false, properties: { target: { type: "string", pattern: "^t[0-9]+$" } } } }
];
const COMPLETION = { type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } };

function outputSchema(tools = TOOLS) {
  return {
    type: "object", additionalProperties: false, required: ["kind", "summary", "decision"],
    properties: {
      kind: { const: "evidence_tool_decision" },
      summary: { type: "string", minLength: 1, maxLength: 240 },
      decision: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, COMPLETION, true, true, true)
    }
  };
}

/** A wrapper as the loop reads it, written as the tool call it would be. */
function asCall(wrapper: { summary?: unknown; decision: Record<string, unknown> }) {
  const offer = automationStudioLlmDecisionTools(outputSchema())!;
  const { kind, toolId, ...rest } = wrapper.decision;
  const tool = offer.tools.find((candidate) => candidate.variant.kind === kind && candidate.variant.toolId === toolId)!;
  return { offer, call: { name: tool.name, input: { ...(wrapper.summary !== undefined ? { summary: wrapper.summary } : {}), ...rest } } };
}

describe("an evidence decision's tools", () => {
  it("are one tool per variant, in the schema's order, named for the tool or the kind", () => {
    const offer = automationStudioLlmDecisionTools(outputSchema())!;
    expect(offer.wrapperKind).toBe("evidence_tool_decision");
    expect(offer.tools.map((tool) => [tool.name, tool.variant])).toEqual([
      ["complete", { kind: "complete" }],
      ["amend_draft", { kind: "amend_draft" }],
      ["core_run_node", { kind: "tool_call", toolId: "core.run_node" }],
      ["web_read_list", { kind: "tool_call", toolId: "web.read_list" }]
    ]);
    for (const tool of offer.tools) expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/u);
  });

  it("carry the variant without its constants, the wrapper's summary first and required, and the input nested as it was", () => {
    const run = automationStudioLlmDecisionTools(outputSchema())!.tools[2]!;
    const properties = run.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(["summary", "callId", "input", "add", "act", "place"]);
    expect(run.inputSchema.required).toEqual(["summary", "callId", "input"]);
    expect(run.inputSchema.additionalProperties).toBe(false);
    expect(properties.summary).toEqual({ type: "string", minLength: 1, maxLength: 240 });
    expect(properties.input).toEqual(TOOLS[0]!.inputSchema);
    expect(run.description).toContain("core.run_node");
  });

  it("are byte-identical for the same offer, and differ when the offer does", () => {
    const one = JSON.stringify(automationStudioLlmDecisionTools(outputSchema()));
    expect(JSON.stringify(automationStudioLlmDecisionTools(outputSchema()))).toBe(one);
    expect(JSON.stringify(automationStudioLlmDecisionTools(outputSchema(TOOLS.slice(0, 1))))).not.toBe(one);
  });

  it("are none where the schema is no decision schema, so the adapter keeps its transport", () => {
    expect(automationStudioLlmDecisionTools({ type: "object", properties: { kind: { const: "diagnosis" } } })).toBeUndefined();
    const schema = outputSchema();
    const broken = { ...schema, properties: { ...schema.properties, decision: { oneOf: [{ type: "object", properties: { kind: { type: "string" } } }] } } };
    expect(automationStudioLlmDecisionTools(broken)).toBeUndefined();
  });
});

describe("a tool call read back", () => {
  const cases: Array<[string, { summary?: unknown; decision: Record<string, unknown> }]> = [
    ["complete", { summary: "Done.", decision: { kind: "complete", result: { summary: "Three rows." } } }],
    ["amend_draft", { summary: "Add the step.", decision: { kind: "amend_draft", amendments: [{ op: "add", step: 3 }] } }],
    ["tool_call", { summary: "Press it.", decision: { kind: "tool_call", toolId: "core.run_node", callId: "call.1", input: { node: "a.press", parameters: { target: "t4" } }, act: "a1" } }],
    ["tool_call with no summary", { decision: { kind: "tool_call", toolId: "web.read_list", callId: "call.2", input: { target: "t9" } } }]
  ];
  for (const [name, wrapper] of cases) {
    it(`is exactly the wrapper the loop reads: ${name}`, () => {
      const { offer, call } = asCall(wrapper);
      const read = automationStudioLlmDecisionFromToolCall(offer, call);
      expect(read).toEqual({ ok: true, response: { kind: "evidence_tool_decision", ...wrapper } });
    });
  }

  it("takes the decision's kind and tool from the tool's name, not from what the input wrote", () => {
    const offer = automationStudioLlmDecisionTools(outputSchema())!;
    const read = automationStudioLlmDecisionFromToolCall(offer, { name: "web_read_list", input: { summary: "Read.", kind: "complete", toolId: "core.run_node", callId: "c", input: {} } });
    expect(read).toEqual({ ok: true, response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "tool_call", toolId: "web.read_list", callId: "c", input: {} } } });
  });

  it("passes an off-shape input on as it came, for the checks to refuse", () => {
    const offer = automationStudioLlmDecisionTools(outputSchema())!;
    const read = automationStudioLlmDecisionFromToolCall(offer, { name: "core_run_node", input: { summary: 7, callId: "c", input: "not an object", extra: true } });
    expect(read).toEqual({ ok: true, response: { kind: "evidence_tool_decision", summary: 7, decision: { kind: "tool_call", toolId: "core.run_node", callId: "c", input: "not an object", extra: true } } });
  });

  it("says a name the offer did not hold is unknown, and an input that is no object is one", () => {
    const offer = automationStudioLlmDecisionTools(outputSchema())!;
    expect(automationStudioLlmDecisionFromToolCall(offer, { name: "core.run_node", input: {} })).toEqual({ ok: false, reason: "unknown_tool" });
    expect(automationStudioLlmDecisionFromToolCall(offer, { name: "web_find", input: {} })).toEqual({ ok: false, reason: "unknown_tool" });
    expect(automationStudioLlmDecisionFromToolCall(offer, { name: "complete", input: [] })).toEqual({ ok: false, reason: "input_not_object" });
  });
});

describe("a tool name", () => {
  it("is unique in its offer, numbered in offer order where two come out the same, and within 64 characters", () => {
    const taken = new Set<string>();
    expect(automationStudioLlmDecisionToolName({ kind: "tool_call", toolId: "web.read" }, taken)).toBe("web_read");
    expect(automationStudioLlmDecisionToolName({ kind: "tool_call", toolId: "web_read" }, taken)).toBe("web_read_2");
    expect(automationStudioLlmDecisionToolName({ kind: "tool_call", toolId: "web:read" }, taken)).toBe("web_read_3");
    const long = automationStudioLlmDecisionToolName({ kind: "tool_call", toolId: "x".repeat(80) }, taken);
    expect(long).toBe("x".repeat(64));
    expect(automationStudioLlmDecisionToolName({ kind: "tool_call", toolId: "x".repeat(70) }, taken)).toBe(`${"x".repeat(62)}_2`);
  });
});
