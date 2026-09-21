import { describe, expect, it } from "vitest";
import { parseAutomationStudioLlmEvidenceBatchDecision } from "../decision.ts";
import { automationStudioLlmEvidenceInputMatchesSchema } from "../input-schema.ts";
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

  it("enforces unique arrays and refuses schema keywords the local validator does not implement", () => {
    const unique = {
      type: "object",
      additionalProperties: false,
      required: ["consequences"],
      properties: {
        consequences: { type: "array", uniqueItems: true, items: { type: "string" } }
      }
    };
    expect(automationStudioLlmEvidenceInputMatchesSchema({ consequences: ["send", "delete"] }, unique)).toBe(true);
    expect(automationStudioLlmEvidenceInputMatchesSchema({ consequences: ["send", "send"] }, unique)).toBe(false);
    expect(automationStudioLlmEvidenceInputMatchesSchema({}, { type: "object", unsupportedConstraint: true })).toBe(false);
  });
});

type InputSchema = Parameters<typeof automationStudioLlmEvidenceInputMatchesSchema>[1];
const accepts = (input: unknown, schema: unknown): boolean =>
  automationStudioLlmEvidenceInputMatchesSchema(input as InputSchema, schema as InputSchema);
const objectWith = (properties: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ type: "object", additionalProperties: false, properties, ...extra });

describe("Automation Studio evidence input schema subset", () => {
  it("refuses a oneOf whose unsupported branch would otherwise drop out of the count", () => {
    // JSON Schema rejects 4: both branches match. A branch dropped only for
    // being unreadable would leave the one match oneOf accepts.
    const schema = objectWith({ n: { oneOf: [{ type: "integer" }, { type: "integer", multipleOf: 2 }] } }, { required: ["n"] });
    expect(accepts({ n: 4 }, schema)).toBe(false);
    expect(accepts({ n: 3 }, schema)).toBe(false);
  });

  it("refuses an unsupported keyword wherever it sits, even where no value reaches it", () => {
    expect(accepts({ x: "first branch" }, objectWith({ x: { anyOf: [{ type: "string" }, { type: "number", multipleOf: 2 }] } }))).toBe(false);
    expect(accepts({}, objectWith({ unused: { type: "string", format: "uri" } }))).toBe(false);
    expect(accepts({ list: [] }, objectWith({ list: { type: "array", items: objectWith({ deep: { type: "string", format: "uri" } }) } }))).toBe(false);
  });

  it("refuses tuple and boolean items for every input", () => {
    for (const items of [[{ type: "string" }], false, true]) {
      const schema = objectWith({ list: { type: "array", items } });
      expect(accepts({ list: [1] }, schema)).toBe(false);
      expect(accepts({ list: ["a"] }, schema)).toBe(false);
      expect(accepts({}, schema)).toBe(false);
    }
  });

  it("refuses boolean property schemas for every input", () => {
    for (const property of [false, true]) {
      const schema = { type: "object", properties: { x: property } };
      expect(accepts({ x: 1 }, schema)).toBe(false);
      expect(accepts({}, schema)).toBe(false);
    }
  });

  it("refuses malformed required, bounds, patterns, types and containers for every input", () => {
    const malformed: Record<string, unknown>[] = [
      { required: "x" },
      { required: [1] },
      { properties: [] },
      { additionalProperties: "no" },
      { minProperties: -1 },
      { maxProperties: 1.5 },
      { properties: { s: { type: "string", maxLength: "3" } } },
      { properties: { s: { type: "string", pattern: 5 } } },
      { properties: { s: { type: "string", pattern: "(" } } },
      { properties: { n: { type: "number", minimum: "1" } } },
      { properties: { n: { type: "strng" } } },
      { properties: { n: { type: [] } } },
      { properties: { l: { type: "array", maxItems: -1 } } },
      { properties: { l: { type: "array", uniqueItems: "yes" } } },
      { properties: { e: { enum: "a" } } },
      { properties: { o: { oneOf: [] } } },
      { properties: { o: { anyOf: {} } } }
    ];
    for (const shape of malformed) expect(accepts({}, { type: "object", ...shape }), JSON.stringify(shape)).toBe(false);
  });

  it("refuses a schema nested deeper than the matcher descends", () => {
    let schema: Record<string, unknown> = { type: "string" };
    let value: unknown = "leaf";
    for (let level = 0; level < 20; level += 1) {
      schema = { type: "object", properties: { next: schema } };
      value = { next: value };
    }
    expect(accepts(value, schema)).toBe(true);
    expect(accepts({ next: value }, { type: "object", properties: { next: schema } })).toBe(false);
    expect(accepts({}, { type: "object", properties: { next: schema } })).toBe(false);
  });

  it("compares values and counts string length the way JSON Schema does", () => {
    const negativeZero = JSON.parse("{\"n\":-0}") as unknown;
    expect(accepts(negativeZero, objectWith({ n: { enum: [0] } }))).toBe(true);
    expect(accepts(negativeZero, objectWith({ n: { oneOf: [{ const: 0 }, { type: "number" }] } }))).toBe(false);
    expect(accepts(JSON.parse("{\"l\":[0,-0]}"), objectWith({ l: { type: "array", uniqueItems: true } }))).toBe(false);
    expect(accepts({ l: [{ a: 1, b: 2 }, { b: 2, a: 1 }] }, objectWith({ l: { type: "array", uniqueItems: true } }))).toBe(false);
    const astral = { s: "\u{1F600}" };
    expect(accepts(astral, objectWith({ s: { type: "string", maxLength: 1 } }))).toBe(true);
    expect(accepts(astral, objectWith({ s: { type: "string", minLength: 2 } }))).toBe(false);
    expect(accepts(astral, objectWith({ s: { oneOf: [{ type: "string", maxLength: 1 }, { type: "string" }] } }))).toBe(false);
  });

  it("reads a property's schema only from the schema's own properties", () => {
    const schema = objectWith({ target: { type: "string" } });
    expect(accepts(JSON.parse("{\"target\":\"x\",\"__proto__\":{}}"), schema)).toBe(false);
    expect(accepts({ target: "x", constructor: 1 }, schema)).toBe(false);
    expect(accepts({ target: "x" }, schema)).toBe(true);
  });

  it("keeps every keyword form today's evidence tools use", () => {
    const press = {
      type: "object",
      required: ["target", "consequences"],
      properties: {
        target: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,160}$" },
        consequences: { type: "array", maxItems: 5, uniqueItems: true, items: { type: "string", enum: ["delete", "send_or_publish"] } }
      },
      additionalProperties: false
    };
    expect(accepts({ target: "t.1", consequences: [] }, press)).toBe(true);
    expect(accepts({ target: "t.1", consequences: ["delete", "send_or_publish"] }, press)).toBe(true);
    expect(accepts({ target: "t.1", consequences: ["pay"] }, press)).toBe(false);
    expect(accepts({ target: "t 1", consequences: [] }, press)).toBe(false);
    expect(accepts({ target: "t.1" }, press)).toBe(false);
    const wait = objectWith({ maxWaitMs: { type: "integer", minimum: 100, maximum: 5000 } }, { required: ["maxWaitMs"] });
    expect(accepts({ maxWaitMs: 500 }, wait)).toBe(true);
    expect(accepts({ maxWaitMs: 500.5 }, wait)).toBe(false);
    expect(accepts({ maxWaitMs: 50 }, wait)).toBe(false);
    const navigate = objectWith({ url: { type: "string", minLength: 1, maxLength: 2048 } }, { required: ["url"] });
    expect(accepts({ url: "https://example.test/" }, navigate)).toBe(true);
    expect(accepts({ url: "" }, navigate)).toBe(false);
    expect(accepts({}, objectWith({}))).toBe(true);
    expect(accepts({ extra: 1 }, objectWith({}))).toBe(false);
  });

  it("still implements oneOf, anyOf, const, type lists and schema-valued additionalProperties", () => {
    const schema = objectWith({
      mode: { oneOf: [{ const: "fast" }, { type: "string", pattern: "^slow" }] },
      value: { type: ["string", "null"] },
      tags: { type: "object", additionalProperties: { type: "string" } },
      flag: { anyOf: [{ type: "boolean" }, { enum: [0, 1] }] }
    });
    expect(accepts({ mode: "fast", value: null, tags: { a: "b" }, flag: 1 }, schema)).toBe(true);
    expect(accepts({ mode: "slowly", flag: true }, schema)).toBe(true);
    expect(accepts({ mode: "other" }, schema)).toBe(false);
    expect(accepts({ tags: { a: 1 } }, schema)).toBe(false);
    expect(accepts({ value: 1 }, schema)).toBe(false);
    expect(accepts({ flag: 2 }, schema)).toBe(false);
    expect(accepts({ mode: "x" }, objectWith({ mode: { oneOf: [{ type: "string" }, { minLength: 1 }] } }))).toBe(false);
    expect(accepts({ s: "abc" }, objectWith({ s: { type: "string", maxLength: undefined } }))).toBe(true);
  });
});
