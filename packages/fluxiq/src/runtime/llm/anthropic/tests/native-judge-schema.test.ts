// A judge's answer goes to Anthropic as its own schema, not as one JSON-text string, and a key one level too deep is read.
import { describe, expect, it } from "vitest";
import { automationStudioAnthropicOutputFormat, automationStudioAnthropicReplyKeyUp } from "../../../models/providers/anthropic/index.ts";
import { automationStudioLlmTaskOutputSchema } from "../../provider-task/index.ts";
import { parseAutomationStudioLlmProviderResult } from "../../harness/index.ts";
import { automationStudioAnthropicRequest } from "../request.ts";
import { automationStudioAnthropicTaskAnswer } from "../task-answer.ts";
import { decisionRequest, request } from "./fixtures.ts";

const USAGE = { inputTokens: 100, outputTokens: 30, totalTokens: 130 };
const judge = (projectId: string) => request({ taskKind: "loop_verification", context: { ...request().context, taskKind: "loop_verification", projectId } });

function objects(value: unknown, found: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(value)) value.forEach((item) => objects(item, found));
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "object") found.push(record);
    Object.values(record).forEach((item) => objects(item, found));
  }
  return found;
}

describe("a judge's schema as Anthropic is sent it", () => {
  for (const taskKind of ["loop_verification", "runtime_diagnosis"] as const) {
    it(`${taskKind} is native, with every object closed and no open metadata`, () => {
      const format = automationStudioAnthropicOutputFormat(automationStudioLlmTaskOutputSchema(request({ taskKind })));
      expect(format.jsonText).toBe(false);
      const all = objects(format.schema);
      expect(all.length).toBeGreaterThan(1);
      for (const object of all) expect(object.additionalProperties).toBe(false);
      expect(Object.keys((format.schema as { properties: object }).properties)).not.toContain("metadata");
    });
  }

  it("keeps metadata in the schema every other provider is shown", () => {
    expect(Object.keys((automationStudioLlmTaskOutputSchema(request({ taskKind: "loop_verification" })) as { properties: object }).properties)).toContain("metadata");
  });

  it("builds byte-identical output_config and system for two steps of one run", () => {
    const first = JSON.parse(automationStudioAnthropicRequest(judge("project.a"), "claude-haiku-5-5").body);
    const second = JSON.parse(automationStudioAnthropicRequest(judge("project.b"), "claude-haiku-5-5").body);
    expect(JSON.stringify(first.output_config)).toBe(JSON.stringify(second.output_config));
    expect(JSON.stringify(first.system)).toBe(JSON.stringify(second.system));
    expect(first.output_config.format.schema.properties.result_json).toBeUndefined();
    expect(JSON.stringify(first.messages)).not.toBe(JSON.stringify(second.messages));
  });
});

describe("a decision's request bodies across steps", () => {
  it("carry the same output_config and system", () => {
    const base = decisionRequest();
    const later = { ...base, context: { ...base.context, evidenceLoop: { ...base.context.evidenceLoop!, iteration: 7 } } };
    const first = JSON.parse(automationStudioAnthropicRequest(base, "claude-haiku-5-5").body);
    const second = JSON.parse(automationStudioAnthropicRequest(later, "claude-haiku-5-5").body);
    expect(JSON.stringify(first.output_config)).toBe(JSON.stringify(second.output_config));
    expect(JSON.stringify(first.system)).toBe(JSON.stringify(second.system));
  });
});

describe("a key one level too deep, keys only", () => {
  const verification = () => request({ taskKind: "loop_verification" });
  const answer = (value: unknown) => () => automationStudioAnthropicTaskAnswer(value, verification(), USAGE, 400);
  const diagnosis = { answersRequest: "yes", expected: "e", observed: "o", changed: "c", defects: [] };

  it("moves confidence out of diagnosis (run-mw48myz5 step 34)", () => {
    const got = answer({ kind: "diagnosis", diagnosis: { ...diagnosis, confidence: 0.9 }, summary: "s" })() as { confidence?: number; diagnosis: Record<string, unknown> };
    expect(got.confidence).toBe(0.9);
    expect(got.diagnosis.confidence).toBeUndefined();
  });

  it("refuses confidence in both places", () => {
    expect(answer({ kind: "diagnosis", confidence: 0.5, diagnosis: { ...diagnosis, confidence: 0.9 }, summary: "s" })).toThrow();
  });

  it("leaves a reply alone where nothing moves", () => {
    const value = { kind: "diagnosis", diagnosis, summary: "s" };
    expect(automationStudioAnthropicReplyKeyUp(value, automationStudioLlmTaskOutputSchema(verification()))).toBe(value);
  });

  it("accepts a long observed text (run-mw3itjcy step 74)", () => {
    expect(answer({ kind: "diagnosis", diagnosis: { ...diagnosis, observed: "x".repeat(575) }, summary: "s" })).not.toThrow();
  });

  it("the harness moves it too, and refuses it in both places", () => {
    const read = (response: unknown) => parseAutomationStudioLlmProviderResult({ response, usage: USAGE }, "diagnosis");
    const moved = read({ kind: "diagnosis", summary: "s", diagnosis: { ...diagnosis, confidence: 0.9 } });
    expect(moved.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(read({ kind: "diagnosis", summary: "s", confidence: 0.4, diagnosis: { ...diagnosis, confidence: 0.9 } }).diagnostics.some((d) => d.code === "llm_output.unexpected_field")).toBe(true);
  });
});
