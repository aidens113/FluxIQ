// t1087: the check's answer tool is sent strict, and a reply that nests the verdict wrongly is refused. Live run
// `run-mwz2jc4w-0c207128`'s judge requests 0087, 0088 and 0090 (Sonnet 5.5) carried byte-identical tools; 0088 sent `diagnosis`
// as a JSON string. Limits relied on (platform docs, structured outputs, "Explicit limits"): 20 strict tools per request, 24
// optional parameters and 16 parameters with union types (`anyOf` or a type array such as `["string", "null"]`) across all
// strict schemas of a request.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS, automationStudioAnthropicAnswerNullsAbsent, automationStudioAnthropicDecisionToolsWire, automationStudioAnthropicGrammar, automationStudioAnthropicSchemaMisses, automationStudioAnthropicStrictAnswerSchema } from "../index.ts";

type Tool = { name: string; description: string; input_schema: Record<string, unknown>; strict?: true };
const here = dirname(fileURLToPath(import.meta.url));
const tools = JSON.parse(readFileSync(join(here, "fixtures", "run-mwz2jc4w-0088-tools.json"), "utf8")) as Tool[];
const replies = JSON.parse(readFileSync(join(here, "fixtures", "run-mwz2jc4w-judge-replies.json"), "utf8")) as Record<string, Record<string, unknown>>;
const ANSWER = "core_check_answer";
/** The judge's own schema, as the request carried it (non-strict, so as the judge wrote it). */
const original = tools.find((tool) => tool.name === ANSWER)!.input_schema;
const offered = (answerSchema: Record<string, unknown>) => tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.name === ANSWER ? answerSchema : tool.input_schema }));
const strictOf = (wire: ReturnType<typeof automationStudioAnthropicDecisionToolsWire>) => wire.tools.filter((tool) => tool.strict);
const DECISION_STRICT = ["complete", "web_detect_repeating_structure", "web_describe_element", "core_describe_nodes", "core_recall_result", "core_full_page"];

/** Each member the schema leaves optional written `null`, as strict decoding makes a model write it. */
function filledWithNull(value: unknown, schema: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => filledWithNull(item, schema.items as Record<string, unknown>));
  if (value === null || typeof value !== "object") return value;
  const given = value as Record<string, unknown>;
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  return Object.fromEntries(Object.keys(properties).map((key) => [key, given[key] === undefined ? null : filledWithNull(given[key], properties[key]!)]));
}

describe("the check's answer tool on the wire", () => {
  it("was non-strict as the judge wrote it, over 0088's recorded tools", () => {
    const wire = automationStudioAnthropicDecisionToolsWire(offered(original));
    expect(wire.tools.find((tool) => tool.name === ANSWER)!.strict).toBeUndefined();
    expect(strictOf(wire).map((tool) => tool.name)).toEqual(DECISION_STRICT);
  });

  it("fits the counted strict-tool, optional-parameter and union limits once reshaped, last (the platform still refused its compiled grammar as too large, 2026-11-27, so it is not sent)", () => {
    const wire = automationStudioAnthropicDecisionToolsWire(offered(automationStudioAnthropicStrictAnswerSchema(original)));
    expect(wire.tools.find((tool) => tool.name === ANSWER)!.strict).toBe(true);
    expect(strictOf(wire).map((tool) => tool.name)).toEqual([...DECISION_STRICT, ANSWER]);
    const costs = strictOf(wire).map((tool) => automationStudioAnthropicGrammar(tool.input_schema, { keepOpenObjects: true }));
    expect(costs.every((cost) => cost.representable)).toBe(true);
    expect(strictOf(wire).length).toBeLessThanOrEqual(AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS.strictTools);
    expect(costs.reduce((sum, cost) => sum + cost.optional, 0)).toBeLessThanOrEqual(AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS.optional);
    expect(costs.reduce((sum, cost) => sum + cost.unions, 0)).toBeLessThanOrEqual(AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS.unions);
    expect(costs[costs.length - 1]!.optional).toBe(0);
  });

  it("requires every member, takes null where the judge's schema left one optional, and leaves out the open metadata bag", () => {
    type Shape = Record<string, unknown> & { required?: string[]; properties?: Record<string, Shape> };
    const reshaped = automationStudioAnthropicStrictAnswerSchema(original) as Shape;
    expect(reshaped.required).toEqual(["kind", "diagnosis", "confidence", "summary"]);
    expect(reshaped.properties!.metadata).toBeUndefined();
    expect(reshaped.properties!.confidence!.type).toEqual(["number", "null"]);
    const diagnosis = reshaped.properties!.diagnosis!;
    expect(diagnosis.required).toEqual(Object.keys(diagnosis.properties!));
    expect(diagnosis.properties!.stillAchievable).toMatchObject({ anyOf: [{ enum: ["yes", "no", "unknown"] }, { type: "null" }] });
    expect(diagnosis.properties!.answersRequest!.type).toBeUndefined();
    expect(JSON.stringify(original)).toContain("\"metadata\"");
  });
});

describe("the replies of run-mwz2jc4w, against the judge's schema", () => {
  const read = (reply: unknown) => automationStudioAnthropicSchemaMisses(automationStudioAnthropicAnswerNullsAbsent(reply, original), original, { lengths: false });

  it("accepts 0087's and 0090's, which are the object it asks for", () => {
    expect(read(replies["0087"])).toEqual([]);
    expect(read(replies["0090"])).toEqual([]);
  });

  it("refuses 0088's, whose diagnosis is a string and whose verdict members sit beside it, and never reads the string back", () => {
    const misses = read(replies["0088"]);
    expect(typeof replies["0088"]!.diagnosis).toBe("string");
    expect(misses.map((miss) => `${miss.path} ${miss.rule}`)).toContain("response.diagnosis must be an object");
    expect(misses.some((miss) => miss.path === "response.answerRecords")).toBe(true);
  });

  it("holds 0087's and 0090's to the strict schema once each absent member is written null, and 0088's not", () => {
    const strict = automationStudioAnthropicStrictAnswerSchema(original);
    for (const step of ["0087", "0090"]) expect(automationStudioAnthropicSchemaMisses(filledWithNull(replies[step], strict), strict, { lengths: false })).toEqual([]);
    expect(automationStudioAnthropicSchemaMisses(filledWithNull(replies["0088"], strict), strict, { lengths: false }).length).toBeGreaterThan(0);
  });

  it("reads a null on an optional member as the member left out, and a null on a required one as a miss", () => {
    const nulled = { ...replies["0087"], confidence: null };
    expect(automationStudioAnthropicAnswerNullsAbsent(nulled, original)).not.toHaveProperty("confidence");
    expect(read(nulled)).toEqual([]);
    expect(read({ ...nulled, summary: null }).length).toBeGreaterThan(0);
  });
});
