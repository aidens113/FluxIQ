// A part's answer may say how many rows it asks for (framework plan K2): the
// plan tool's schema offers `answer.rows`, the task spec reads it, and the plan
// input carries it into the spec the judge's checklist is made from. Absent,
// nothing changes, and a spec digested before the field existed keeps its
// digest. A library catalogue, shaped unlike any Lab scenario.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { automationStudioProjectTaskSpec, type AutomationStudioProjectTaskAnswerRows } from "../../../../contracts/index.ts";
import { taskSpec } from "../../../../tests/fixtures.ts";
import { automationStudioProjectSupervisorPlanInput } from "../../../plan-input.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../../tool-ids.ts";
import { automationStudioProjectSupervisorTools } from "../../../tools.ts";
import { SOURCES, planInput, subflow, taskSpecInput } from "../../supervisor-fixture.ts";
import { FIND } from "../../supervisor-script.ts";

function answerSchema(): JsonObject {
  const tool = automationStudioProjectSupervisorTools().find((candidate) => candidate.toolId === IDS.writePlan)!;
  const taskSpecSchema = (tool.inputSchema.properties as JsonObject).taskSpec as JsonObject;
  const parts = (taskSpecSchema.properties as JsonObject).parts as JsonObject;
  return ((parts.items as JsonObject).properties as JsonObject).answer as JsonObject;
}

/** Words the ten realistic scenarios are made of; the tool's own text names none of them. */
const SCENARIO_WORDS = /\b(?:cart|basket|product|deal|shop|store|listing|auction|bid|job|salary|post|feed|friend|photo|like|follower|classified|seller)s?\b/iu;

describe("the plan tool's answer schema", () => {
  it("offers an optional rows of whole-number count, atLeast and atMost, and nothing else", () => {
    const answer = answerSchema();
    const rows = (answer.properties as JsonObject).rows as JsonObject;
    expect(rows.type).toBe("object");
    expect(rows.properties).toEqual({ count: { type: "integer" }, atLeast: { type: "integer" }, atMost: { type: "integer" } });
    expect(rows.additionalProperties).toBe(false);
    expect(rows.required).toBeUndefined();
    expect(answer.required).toEqual(["kind", "columns"]);
  });

  it("describes rows in generic words with a library's example", () => {
    const said = String(((answerSchema().properties as JsonObject).rows as JsonObject).description);
    expect(said).toContain("count");
    expect(said).toContain("books");
    expect(said).not.toMatch(SCENARIO_WORDS);
  });
});

describe("the task spec's answer rows", () => {
  const withRows = (rows: AutomationStudioProjectTaskAnswerRows) => taskSpec((spec) => (spec.parts[0]!.answer = { kind: "records", columns: ["title"], rows }));

  it("reads an exact count and a range as written, and keeps a spec without rows under its old digest", () => {
    for (const rows of [{ count: 5 }, { atLeast: 3 }, { atMost: 10 }, { atLeast: 2, atMost: 4 }]) {
      const spec = withRows(rows);
      expect(automationStudioProjectTaskSpec.parse(spec)).toEqual({ status: "valid", value: spec });
    }
    const without = taskSpec((spec) => (spec.parts[0]!.answer = { kind: "records", columns: ["title"] }));
    expect(automationStudioProjectTaskSpec.parse(without)).toEqual({ status: "valid", value: without });
    expect(withRows({ count: 5 }).digest).not.toBe(without.digest);
  });

  it("refuses rows that say nothing, a count beside a range, a range upside down, a number that is not a whole count from 1, and an unknown key", () => {
    for (const [rows, path] of [
      [{}, "taskSpec.parts.0.answer.rows"],
      [{ count: 5, atLeast: 3 }, "taskSpec.parts.0.answer.rows"],
      [{ atLeast: 6, atMost: 4 }, "taskSpec.parts.0.answer.rows"],
      [{ count: 0 }, "taskSpec.parts.0.answer.rows.count"],
      [{ atLeast: 2.5 }, "taskSpec.parts.0.answer.rows.atLeast"],
      [{ atMost: "10" }, "taskSpec.parts.0.answer.rows.atMost"],
      [{ count: 10_001 }, "taskSpec.parts.0.answer.rows.count"]
    ] as const) {
      const value = structuredClone(taskSpec()) as unknown as { parts: Array<Record<string, unknown>> };
      value.parts[0]!.answer = { kind: "records", columns: ["title"], rows };
      expect(automationStudioProjectTaskSpec.parse(value)).toMatchObject({ status: "invalid", code: "project.answer_rows_invalid", path });
    }
    const value = structuredClone(taskSpec()) as unknown as { parts: Array<Record<string, unknown>> };
    value.parts[0]!.answer = { kind: "records", columns: ["title"], rows: { count: 3, limit: 3 } };
    expect(automationStudioProjectTaskSpec.parse(value)).toMatchObject({ status: "invalid", code: "project.unknown_field", path: "taskSpec.parts.0.answer.rows.limit" });
  });

  it("is carried by the plan input into the spec the build is judged by", () => {
    const spec = taskSpecInput([["p1", FIND, []]]);
    ((spec.parts as JsonObject[])[0] as JsonObject).answer = { kind: "records", columns: ["title"], rows: { count: 3 } };
    const result = automationStudioProjectSupervisorPlanInput(planInput([subflow("find_titles", ["p1"])], spec), SOURCES);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.taskSpec.parts[0]!.answer).toEqual({ kind: "records", columns: ["title"], rows: { count: 3 } });
  });
});
