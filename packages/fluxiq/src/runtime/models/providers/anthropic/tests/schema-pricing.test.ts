import { describe, expect, it } from "vitest";
import { automationStudioAnthropicOutputFormat, automationStudioAnthropicMatchesSchema } from "../schema.ts";
import { automationStudioAnthropicCacheWriteTokens, automationStudioAnthropicUsage, estimateAutomationStudioAnthropicCostUsd } from "../pricing.ts";
const USAGE = { input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 50, cache_creation_input_tokens: 20, cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 0 } };

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

  // Official pricing page, read 2026-11-05: Sonnet 5.5 $2 input, $2.50 five-minute write, $4 hour write, $0.10 hit, $10 output.
  it("bills Sonnet 5.5's cache read at $0.10 a million, and its writes above input", () => {
    expect(estimateAutomationStudioAnthropicCostUsd(1_000_000, 0, 1_000_000, "claude-sonnet-5-5")).toBeCloseTo(0.1, 9);
    expect(estimateAutomationStudioAnthropicCostUsd(1_000_000, 0, 0, "claude-sonnet-5-5", 1_000_000)).toBeCloseTo(2.5, 9);
    expect(estimateAutomationStudioAnthropicCostUsd(1_000_000, 0, 0, "claude-sonnet-5-5", 1_000_000, 1_000_000)).toBeCloseTo(4, 9);
    expect(estimateAutomationStudioAnthropicCostUsd(1_000_000, 0, 1_000_000, "claude-opus-5-5")).toBeCloseTo(0.2, 9);
  });

  // "A request's prompt length counts all of its input tokens, including cache reads and cache writes." Up to 100,000: $0.10 input, $0.125 write, $0.20 hour write, $0.01 hit, $0.50 output. Over: $0.50, $0.625, $1, $0.05, $2.50.
  it("prices Haiku 5.5 by the whole prompt, on either side of 100,000 tokens, cached parts included", () => {
    const below = automationStudioAnthropicUsage({ input_tokens: 10_000, cache_read_input_tokens: 60_000, cache_creation_input_tokens: 30_000, output_tokens: 1_000 }, "claude-haiku-5-5")!;
    expect(below.inputTokens).toBe(100_000);
    expect(below.estimatedCostUsd).toBeCloseTo((10_000 * 0.1 + 60_000 * 0.01 + 30_000 * 0.125 + 1_000 * 0.5) / 1e6, 9);
    const above = automationStudioAnthropicUsage({ input_tokens: 10_001, cache_read_input_tokens: 60_000, cache_creation_input_tokens: 30_000, output_tokens: 1_000 }, "claude-haiku-5-5")!;
    expect(above.inputTokens).toBe(100_001);
    expect(above.estimatedCostUsd).toBeCloseTo((10_001 * 0.5 + 60_000 * 0.05 + 30_000 * 0.625 + 1_000 * 2.5) / 1e6, 9);
    // A prompt that is nearly all cache reads is still over the line: only 1,000 tokens are uncached.
    expect(automationStudioAnthropicUsage({ input_tokens: 1_000, cache_read_input_tokens: 150_000, output_tokens: 0 }, "claude-haiku-5-5")!.estimatedCostUsd).toBeCloseTo((1_000 * 0.5 + 150_000 * 0.05) / 1e6, 9);
    expect(estimateAutomationStudioAnthropicCostUsd(100_001, 0, 0, "claude-haiku-5-5", 100_001, 100_001)).toBeCloseTo(100_001 * 1 / 1e6, 9);
    expect(estimateAutomationStudioAnthropicCostUsd(100_000, 0, 0, "claude-haiku-5-5", 100_000, 100_000)).toBeCloseTo(100_000 * 0.2 / 1e6, 9);
  });

  it("reads what a reply wrote to the cache", () => {
    expect(automationStudioAnthropicCacheWriteTokens(USAGE)).toBe(20);
    expect(automationStudioAnthropicCacheWriteTokens({ input_tokens: 1 })).toBe(0);
    expect(automationStudioAnthropicCacheWriteTokens({ cache_creation_input_tokens: -1 })).toBeUndefined();
    expect(automationStudioAnthropicCacheWriteTokens(undefined)).toBeUndefined();
  });
});
