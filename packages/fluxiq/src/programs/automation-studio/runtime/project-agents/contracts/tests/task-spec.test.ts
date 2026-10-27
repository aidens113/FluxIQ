import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { automationStudioProjectActiveInstructionSources, automationStudioProjectTaskSpec } from "../index.ts";
import { SOURCE_TEXT, sources, taskSpec } from "../../tests/fixtures.ts";

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

  // A8 wave 10 crossborder `run-mv9q50ui-1736d010` (t638): the whole request as p1 and a span inside it as p2.
  it("refuses two parts of one instruction whose words overlap, and accepts parts that do not", () => {
    const whole = taskSpec((spec) => (spec.parts[0]!.quote.text = "list the five newest soups. Then save the first one"));
    expect(automationStudioProjectTaskSpec.quoteIssues(whole, sources())).toEqual([{ code: "project.quote_overlaps", path: "taskSpec.parts.1.quote.text" }]);
    const inside = taskSpec((spec) => (spec.parts[1]!.quote.text = "five newest"));
    expect(automationStudioProjectTaskSpec.quoteIssues(inside, sources())).toEqual([{ code: "project.quote_overlaps", path: "taskSpec.parts.1.quote.text" }]);
    const same = taskSpec((spec) => (spec.parts[1]!.quote.text = spec.parts[0]!.quote.text));
    expect(automationStudioProjectTaskSpec.quoteIssues(same, sources())).toEqual([{ code: "project.quote_overlaps", path: "taskSpec.parts.1.quote.text" }]);
    // Touching is not overlapping: one part ends where the next begins.
    const adjacent = taskSpec((spec) => {
      spec.parts[0]!.quote.text = "list the five newest soups.";
      spec.parts[1]!.quote.text = " Then save the first one to my cookbook.";
    });
    expect(automationStudioProjectTaskSpec.quoteIssues(adjacent, sources())).toEqual([]);
    // Words the person wrote twice are placed apart; in two instructions they never overlap.
    const twice = [{ sourceId: "instruction.1", text: "save the first one, then save the first one again." }];
    const repeated = taskSpec((spec) => {
      spec.parts[0]!.quote = { sourceId: "instruction.1", text: "save the first one" };
      spec.parts[1]!.quote = { sourceId: "instruction.1", text: "save the first one" };
    });
    expect(automationStudioProjectTaskSpec.quoteIssues(repeated, twice)).toEqual([]);
    const apart = [...sources(), { sourceId: "instruction.2", text: SOURCE_TEXT }];
    expect(automationStudioProjectTaskSpec.quoteIssues(taskSpec((spec) => (spec.parts[1]!.quote = { sourceId: "instruction.2", text: spec.parts[0]!.quote.text })), apart)).toEqual([]);
  });

  // t757: a part that asks for records says so in a typed field, which the judge holds a yes to; a part without it is as before.
  it("reads a part's declared answer of records, keeps a spec without one byte for byte, and refuses a malformed one", () => {
    const declared = taskSpec((spec) => (spec.parts[0]!.answer = { kind: "records", columns: ["name", "date"] }));
    expect(automationStudioProjectTaskSpec.parse(declared)).toEqual({ status: "valid", value: declared });
    expect(declared.digest).not.toBe(taskSpec().digest);
    const unnamed = taskSpec((spec) => (spec.parts[0]!.answer = { kind: "records", columns: [] }));
    expect(automationStudioProjectTaskSpec.parse(unnamed)).toEqual({ status: "valid", value: unnamed });
    // A spec digested before the field existed still reads, under the digest it always had.
    expect(automationStudioProjectTaskSpec.parse(taskSpec())).toEqual({ status: "valid", value: taskSpec() });
    for (const [answer, code] of [
      [{ kind: "rows", columns: [] }, "project.invalid_choice"],
      [{ kind: "records" }, "project.missing_field"],
      [{ kind: "records", columns: ["name"], extra: 1 }, "project.unknown_field"],
      [{ kind: "records", columns: ["  "] }, "project.invalid_text"],
      [{ kind: "records", columns: ["name", "name"] }, "project.duplicate"]
    ] as const) {
      const value = structuredClone(taskSpec()) as unknown as { parts: Array<Record<string, unknown>> };
      value.parts[0]!.answer = answer;
      expect(automationStudioProjectTaskSpec.parse(value)).toMatchObject({ status: "invalid", code, path: expect.stringMatching(/^taskSpec\.parts\.0\.answer/u) });
    }
  });

  it("takes only active instructions as sources", () => {
    const instruction = (instructionId: string, status: AutomationStudioFlowInstruction["status"]): AutomationStudioFlowInstruction =>
      ({ schemaVersion: "0.1", instructionId, title: instructionId, body: `body of ${instructionId}`, status, priority: 1, createdAt: 1, updatedAt: 1 }) as AutomationStudioFlowInstruction;
    expect(automationStudioProjectActiveInstructionSources([instruction("a", "active"), instruction("b", "disabled"), instruction("c", "archived")])).toEqual([{ sourceId: "a", text: "body of a" }]);
  });
});
