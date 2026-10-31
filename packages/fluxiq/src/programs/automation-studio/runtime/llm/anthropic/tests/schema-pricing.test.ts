import { describe, expect, it } from "vitest";
import { automationStudioAnthropicOutputFormat, automationStudioAnthropicMatchesSchema } from "../schema.ts";
import { automationStudioAnthropicUsage, estimateAutomationStudioAnthropicCostUsd } from "../pricing.ts";
import { USAGE } from "./fixtures.ts";

describe("Anthropic schema and billing boundaries", () => {
  it("projects unsupported constraints into descriptions and enforces the unchanged original", () => {
    const schema = { type: "object", properties: { count: { type: "integer", minimum: 2, maximum: 8 } }, required: ["count"], additionalProperties: false };
    const format = automationStudioAnthropicOutputFormat(schema);
    expect(format).toMatchObject({ jsonText: false, schema: { properties: { count: { type: "integer", description: "Original constraints: minimum: 2; maximum: 8." } } } });
    expect(automationStudioAnthropicMatchesSchema({ count: 1 }, schema)).toBe(false);
    expect(automationStudioAnthropicMatchesSchema({ count: 3 }, schema)).toBe(true);
  });

  it("uses lossless JSON transport for maps, optional overflow, and union overflow", () => {
    expect(automationStudioAnthropicOutputFormat({ type: "object" }).jsonText).toBe(true);
    const properties = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`field${index}`, { type: "string" }]));
    expect(automationStudioAnthropicOutputFormat({ type: "object", properties, additionalProperties: false }).jsonText).toBe(true);
    const unions = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`field${index}`, { anyOf: [{ type: "string" }, { type: "number" }] }]));
    expect(automationStudioAnthropicOutputFormat({ type: "object", properties: unions, required: Object.keys(unions), additionalProperties: false }).jsonText).toBe(true);
  });

  it("bills uncached input, cache reads, 5m and 1h writes, and Haiku's whole-prompt tiers", () => {
    expect(automationStudioAnthropicUsage(USAGE, "claude-sonnet-5-5")).toMatchObject({ inputTokens: 170, cacheMissInputTokens: 120, estimatedCostUsd: 0.000555 });
    expect(estimateAutomationStudioAnthropicCostUsd(1000, 100, 300, "claude-sonnet-5-5", 200, 100)).toBe(0.00268);
    expect(estimateAutomationStudioAnthropicCostUsd(100_000, 1000, 0, "claude-haiku-5-5")).toBe(0.0105);
    expect(estimateAutomationStudioAnthropicCostUsd(100_001, 1000, 0, "claude-haiku-5-5")).toBe(0.0525005);
    expect(estimateAutomationStudioAnthropicCostUsd(1000, 100, 0, "claude-opus-5-5")).toBe(0.006);
    expect(automationStudioAnthropicUsage({ ...USAGE, cache_creation: { ephemeral_1h_input_tokens: 21 } }, "claude-sonnet-5-5")).toBeUndefined();
  });
});
