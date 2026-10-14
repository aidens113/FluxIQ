import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { automationStudioProjectActiveInstructionSources, automationStudioProjectTaskSpec } from "../index.ts";
import { sources, taskSpec } from "../../tests/fixtures.ts";

describe("task spec", () => {
  it("parses a good spec unchanged", () => {
    expect(automationStudioProjectTaskSpec.parse(taskSpec())).toEqual({ status: "valid", value: taskSpec() });
  });

  it.each([
    ["missing field", (value: Record<string, unknown>) => delete value.notAsked, "project.missing_field"],
    ["unknown field", (value: Record<string, unknown>) => (value.extra = 1), "project.unknown_field"],
    ["no parts", (value: Record<string, unknown>) => (value.parts = []), "project.task_spec_empty"],
    ["unknown lasting act", (value: Record<string, unknown>) => ((value.parts as Array<Record<string, unknown>>)[1]!.lastingActs = ["buy_things"]), "project.invalid_choice"],
    ["duplicate part ids", (value: Record<string, unknown>) => ((value.parts as Array<Record<string, unknown>>)[1]!.id = "p1"), "project.duplicate_part"],
    ["blank quote", (value: Record<string, unknown>) => ((value.parts as Array<{ quote: { text: string } }>)[0]!.quote.text = "  "), "project.invalid_text"]
  ])("refuses a malformed spec: %s", (_name, change, code) => {
    const value = structuredClone(taskSpec()) as unknown as Record<string, unknown>;
    change(value);
    expect(automationStudioProjectTaskSpec.parse(value)).toMatchObject({ status: "invalid", code });
  });

  it("refuses a forged digest: content edited after it was digested", () => {
    const forged = taskSpec();
    forged.parts[0]!.goalFacts = ["anything at all"];
    expect(automationStudioProjectTaskSpec.parse(forged)).toMatchObject({ status: "invalid", code: "project.task_spec_digest_mismatch" });
  });

  it("refuses accessors and non-plain objects", () => {
    const withGetter = { ...taskSpec() } as Record<string, unknown>;
    Object.defineProperty(withGetter, "notAsked", { get: () => [], enumerable: true });
    expect(automationStudioProjectTaskSpec.parse(withGetter)).toMatchObject({ status: "invalid", code: "project.accessor_field" });
    expect(automationStudioProjectTaskSpec.parse(Object.assign(new (class Spec {})(), taskSpec()))).toMatchObject({ status: "invalid", code: "project.not_plain" });
  });

  it("changes its digest when any part changes", () => {
    const base = taskSpec().digest;
    expect(taskSpec((spec) => (spec.notAsked = [])).digest).not.toBe(base);
    expect(taskSpec((spec) => (spec.parts[1]!.lastingActs = [])).digest).not.toBe(base);
    expect(taskSpec().digest).toBe(base);
  });

  it("accepts only verbatim quotes of a named source", () => {
    expect(automationStudioProjectTaskSpec.quoteIssues(taskSpec(), sources())).toEqual([]);
    const paraphrase = taskSpec((spec) => (spec.parts[0]!.quote.text = "list the 5 newest soups"));
    expect(automationStudioProjectTaskSpec.quoteIssues(paraphrase, sources())).toEqual([{ code: "project.quote_not_verbatim", path: "taskSpec.parts.0.quote.text" }]);
    const elsewhere = taskSpec((spec) => (spec.parts[1]!.quote.sourceId = "instruction.2"));
    expect(automationStudioProjectTaskSpec.quoteIssues(elsewhere, sources())).toEqual([{ code: "project.quote_source_unknown", path: "taskSpec.parts.1.quote.sourceId" }]);
  });

  it("takes only active instructions as sources", () => {
    const instruction = (instructionId: string, status: AutomationStudioFlowInstruction["status"]): AutomationStudioFlowInstruction =>
      ({ schemaVersion: "0.1", instructionId, title: instructionId, body: `body of ${instructionId}`, status, priority: 1, createdAt: 1, updatedAt: 1 }) as AutomationStudioFlowInstruction;
    expect(automationStudioProjectActiveInstructionSources([instruction("a", "active"), instruction("b", "disabled"), instruction("c", "archived")])).toEqual([{ sourceId: "a", text: "body of a" }]);
  });
});
