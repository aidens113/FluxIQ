// Core never caps what a model wrote (user, a standing rule; t869). A paid reply is not refused, and nothing it says is cut,
// for being long or for listing many things: a person's display may shorten it, and the record stays whole. What a bound
// still holds is named beside it: a name or an id, the parts of a repair written into a running automation's graph, and
// the shape a reply must have to be read at all.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioLlmProviderResult, type AutomationStudioLlmTaskRequest } from "../index.ts";
import { automationStudioRuntimePatchOutputSchema } from "../runtime-patch-schema.ts";
import { automationStudioLlmTaskOutputSchema } from "../../provider-task/index.ts";
import { AUTOMATION_STUDIO_LLM_VERIFICATION_DEFECTS_SCHEMA } from "../../verification-defects/index.ts";

const errors = (result: ReturnType<typeof parseAutomationStudioLlmProviderResult>) => result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
const longWords = "A sentence a model wrote, and meant. ".repeat(2_000);
const defect = (row: string, words = "the words asked") => ({ kind: "kept_not_asked", row, requestWords: words });
const judged = (defects: unknown) => parseAutomationStudioLlmProviderResult({ response: { kind: "diagnosis", summary: "Not what was asked.", diagnosis: { answersRequest: "no", defects } } }, "diagnosis", undefined, undefined, true);

describe("a judge's current no", () => {
  it("is read with every defect, however many it lists", () => {
    const many = Array.from({ length: 40 }, (_, index) => defect(`Row ${index + 1}`));
    const result = judged(many);
    expect(errors(result)).toEqual([]);
    expect(result.response).toMatchObject({ diagnosis: { answersRequest: "no", defects: many } });
  });

  it("is read with each defect's text whole, however long", () => {
    const whole = defect(longWords, longWords);
    const result = judged([{ ...whole, kind: "wrong_value", column: longWords, value: longWords }]);
    expect(errors(result)).toEqual([]);
    expect(result.response).toMatchObject({ diagnosis: { defects: [{ row: longWords, column: longWords, value: longWords, requestWords: longWords }] } });
  });

  it("is still held to a defect's shape, since Core has to find each one in its record", () => {
    for (const malformed of [[{ kind: "a kind Core does not know", row: "a row", requestWords: "words" }], [{ kind: "kept_not_asked", row: "   ", requestWords: "words" }], [{ kind: "wrong_value", row: "a row", value: "9", requestWords: "words" }], "not a list"]) {
      expect(errors(judged(malformed)).map((diagnostic) => diagnostic.code), JSON.stringify(malformed)).toContain("llm_output.verification_defects_required");
    }
  });

  it("is told no limit in the schema it answers to", () => {
    expect(AUTOMATION_STUDIO_LLM_VERIFICATION_DEFECTS_SCHEMA).not.toHaveProperty("maxItems");
    expect(JSON.stringify(AUTOMATION_STUDIO_LLM_VERIFICATION_DEFECTS_SCHEMA)).not.toContain("maxLength");
    const schema = automationStudioLlmTaskOutputSchema({ taskKind: "loop_verification" } as AutomationStudioLlmTaskRequest) as { properties: { summary: object; diagnosis: { properties: { defects: object } } } };
    expect(schema.properties.summary).not.toHaveProperty("maxLength");
    expect(schema.properties.diagnosis.properties.defects).not.toHaveProperty("maxItems");
  });
});

describe("prose a model wrote is read whole", () => {
  it("a diagnosis summary past what the harness once allowed", () => {
    const result = parseAutomationStudioLlmProviderResult({ response: { kind: "diagnosis", summary: longWords.repeat(2), diagnosis: { answersRequest: "yes" } } }, "diagnosis");
    expect(errors(result)).toEqual([]);
    expect(result.response?.summary).toBe(longWords.repeat(2));
  });

  it("an instruction's words and any number of its tags, and any number of suggestions", () => {
    const instructions = Array.from({ length: 150 }, () => ({ title: longWords, body: longWords.repeat(2), tags: Array.from({ length: 150 }, (_, index) => `tag${index}`) }));
    const result = parseAutomationStudioLlmProviderResult({ response: { kind: "instruction_suggestion", summary: longWords, instructions } }, "instruction_suggestion");
    expect(errors(result)).toEqual([]);
  });

  it("a change proposal's summary, and any number of its patches", () => {
    const patches = Array.from({ length: 150 }, () => ({ kind: "edit_instruction", summary: longWords.repeat(2) }));
    const result = parseAutomationStudioLlmProviderResult({ response: { kind: "change_proposal", summary: "Changes.", patches, riskLevel: "low" } }, "change_proposal");
    expect(errors(result).map((diagnostic) => diagnostic.code)).not.toContain("llm_output.invalid_patch_summary");
    expect(errors(result).map((diagnostic) => diagnostic.code)).not.toContain("llm_output.too_many_patches");
  });

  it("a repair's reason and summary, in the reply and in the schema it answers to", () => {
    const patch = { kind: "temporary_reroute", reason: longWords.repeat(2), fromNodeId: "a", toNodeId: "b" };
    const result = parseAutomationStudioLlmProviderResult({ response: { kind: "runtime_patch", summary: longWords.repeat(2), patches: [patch], riskLevel: "low" } }, "runtime_patch");
    expect(errors(result).map((diagnostic) => diagnostic.code)).not.toContain("llm_output.invalid_patch_reason");
    expect(errors(result).map((diagnostic) => diagnostic.code)).not.toContain("llm_output.invalid_summary");
    const schema = JSON.stringify(automationStudioRuntimePatchOutputSchema({ proposalOnly: false }));
    expect(schema).toContain('"reason":{"type":"string","minLength":1}');
    expect(schema).toContain('"summary":{"type":"string","minLength":1}');
  });
});

describe("a long or nested reply", () => {
  const completion = (result: unknown) => parseAutomationStudioLlmProviderResult({ response: { kind: "evidence_tool_decision", summary: "Done.", decision: { kind: "complete", result } } }, "evidence_tool_decision");

  it("is read past the list, object and value counts that once refused it", () => {
    const rows = Array.from({ length: 4_000 }, (_, index) => ({ title: `Row ${index}`, status: "kept", at: index }));
    const manyKeys = Object.fromEntries(Array.from({ length: 1_500 }, (_, index) => [`key${index}`, index]));
    const result = completion({ rows, manyKeys });
    expect(errors(result)).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm_output.provider_result_too_large");
  });

  it("is read past twenty levels, and stops only at the recursion guard", () => {
    const nested = (levels: number): unknown => (levels === 0 ? "end" : { in: nested(levels - 1) });
    expect(errors(completion(nested(30)))).toEqual([]);
    expect(errors(completion(nested(80))).map((diagnostic) => diagnostic.code)).toContain("llm_output.provider_result_too_large");
  });

  it("carries any number of amendments past the reply check, where the loop's own reader answers them", () => {
    const amendments = Array.from({ length: 30 }, (_, index) => ({ step: index + 1, change: "drop" }));
    const result = parseAutomationStudioLlmProviderResult({ response: { kind: "evidence_tool_decision", summary: "Dropping them.", decision: { kind: "amend_draft", amendments } } }, "evidence_tool_decision");
    expect(errors(result)).toEqual([]);
    const none = parseAutomationStudioLlmProviderResult({ response: { kind: "evidence_tool_decision", summary: "Nothing.", decision: { kind: "amend_draft", amendments: [] } } }, "evidence_tool_decision");
    expect(errors(none).map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_evidence_amendment");
  });
});

describe("what a bound still holds", () => {
  it("a repair's steps, which are written into a running automation's graph", () => {
    const steps = Array.from({ length: 9 }, () => ({ definitionId: "builtin.data.constant" }));
    const result = parseAutomationStudioLlmProviderResult({ response: { kind: "runtime_patch", summary: "A repair.", riskLevel: "low", patches: [{ kind: "temporary_action_sequence", reason: "r", targetNodeId: "n", steps, consequences: [] }] } }, "runtime_patch");
    expect(errors(result).map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_action_sequence");
  });

  it("a name or an id", () => {
    const result = parseAutomationStudioLlmProviderResult({ response: { kind: "runtime_patch", summary: "A repair.", riskLevel: "low", patches: [{ kind: "temporary_reroute", reason: "r", fromNodeId: "n".repeat(20_001), toNodeId: "b" }] } }, "runtime_patch");
    expect(errors(result).map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_reroute");
  });
});
