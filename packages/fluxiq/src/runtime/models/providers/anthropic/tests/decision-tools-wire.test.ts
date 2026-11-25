// D12 (t1038): decision tools on Anthropic's wire, strict where the grammar holds them within the per-request limits.
import { describe, expect, it } from "vitest";
import { automationStudioAnthropicDecisionToolsWire } from "../index.ts";

const closed = (extra: Record<string, unknown> = {}) => ({ type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string", maxLength: 240 }, ...extra } });
const tool = (name: string, inputSchema: Record<string, unknown>) => ({ name, description: `Tool ${name}.`, inputSchema });

describe("decision tools on the wire", () => {
  it("are strict in their grammar form where the schema is closed, and as they are where it is open", () => {
    const wire = automationStudioAnthropicDecisionToolsWire([
      tool("closed", closed({ callId: { type: "string", pattern: "^[a-z]+$" } })),
      tool("open", closed({ parameters: { type: "object" } }))
    ]);
    expect(wire.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    const [strict, open] = wire.tools;
    expect(strict!.strict).toBe(true);
    // A constraint the grammar does not enforce is told in words; the pattern and length stay out of the grammar.
    expect(JSON.stringify(strict!.input_schema)).not.toContain("\"pattern\"");
    expect((strict!.input_schema.properties as Record<string, { description?: string }>).callId!.description).toContain("Original constraints: pattern");
    expect(open!.strict).toBeUndefined();
    expect(open!.input_schema).toEqual(closed({ parameters: { type: "object" } }));
  });

  it("take tools strict in offer order only while the request's optional and strict-tool limits hold", () => {
    // Each tool has 3 optional properties: 8 fit the 24 optional parameters, the ninth does not.
    const many = Array.from({ length: 10 }, (_, at) => tool(`t${at}`, closed({ a: { type: "string" }, b: { type: "boolean" }, c: { type: "string" } })));
    const strict = automationStudioAnthropicDecisionToolsWire(many).tools.map((definition) => definition.strict === true);
    expect(strict).toEqual([true, true, true, true, true, true, true, true, false, false]);
    const tiny = Array.from({ length: 22 }, (_, at) => tool(`t${at}`, closed()));
    expect(automationStudioAnthropicDecisionToolsWire(tiny).tools.filter((definition) => definition.strict).length).toBe(20);
  });

  it("are the same bytes for the same tools", () => {
    const tools = [tool("a", closed()), tool("b", closed({ x: { type: "object" } }))];
    expect(JSON.stringify(automationStudioAnthropicDecisionToolsWire(tools))).toBe(JSON.stringify(automationStudioAnthropicDecisionToolsWire(tools)));
  });
});
