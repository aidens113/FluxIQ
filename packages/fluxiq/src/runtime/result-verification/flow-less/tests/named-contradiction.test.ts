// A Flow-less no that names no contradiction is read as unknown (t1072). Through the real harness with a scripted
// provider: no model is called.
//
// Run `run-mwyfoz8o-507c92f6` (0101): the judge of a replay that kept the right rows in the right order said no, its own
// summary saying the rows were right and the verdict stayed no only because one value could not be seen. Its reply, as
// recorded, is the first case. The rest are made up (a garden centre's plants).
import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmDiagnosisFields, type AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import { automationStudioFlowLessNoNamesContradiction } from "../named-contradiction.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_QUESTION } from "../question.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** run-mwyfoz8o-507c92f6, steps/0101-judge/decision.json, `response.diagnosis`, whole. */
const DIAGNOSIS_0101: AutomationStudioLlmDiagnosisFields = {
  answersRequest: "no",
  defects: [
    { kind: "wrong_value", row: "Rust Developer (Embedded)", column: "salary", value: "£70,000 – £78,000 a year", requestWords: "newest posting first" },
    { kind: "other", row: "all 7 kept rows", step: "sort", requestWords: "newest posting first" }
  ],
  checked: [
    { row: "Senior Rust Engineer", column: "salary", value: "£85,000 – £100,000 a year" },
    { row: "Rust Engineer, Settlement Systems", column: "salary", value: "£72k – £80k per annum" },
    { row: "Backend Engineer – Rust", column: "salary", value: "£90,000 a year" },
    { row: "Staff Rust Engineer", column: "salary", value: "From £95,000 a year" },
    { row: "Rust Developer (Embedded)", column: "salary", value: "£70,000 – £78,000 a year" },
    { row: "Principal Engineer (Rust, Distributed Systems)", column: "salary", value: "£110,000 – £130,000 a year" },
    { row: "Rust Platform Engineer", column: "salary", value: "£75,000 – £88,000 a year" }
  ],
  answerRecords: { asked: true, siteShows: 7 },
  explorationNeeded: false,
  patchNeeded: true
};

/** The same reply, whole: its diagnosis and its summary. */
const REPLY_0101 = {
  kind: "diagnosis",
  diagnosis: DIAGNOSIS_0101,
  summary: "The seven kept rows are the right set: UK-remote, Rust in the title, a yearly salary starting at £70,000 or more, none a day rate, up-to-only or salary-less, and each linked to its own /viewjob page with duplicates and sponsored copies dropped. The order is wrong, though. The processing declares a sort by posted descending, but the rows come back as Today, 1 day, 3 days, 4 days, 6 days, 9 days, 13 days, which is not the order the declaration describes. Newest is Today, so ascending age is correct, but 'Posted 1 day ago' is listed before 'Posted 3 days ago' while 'Rust Developer (Embedded)' (6 days) sits between 'Staff Rust Engineer' (4 days) and 'Principal Engineer' (9 days), which is consistent with newest first. On a closer read the order is actually newest-first. The defect is therefore doubtful, so the verdict stays no only because the sort cannot be confirmed from the stored columns (posted is not kept in the output rows). Evidence needed: the posted values of the final rows."
};

/** The kept rows 0101 was shown, in the asked columns. */
const SUMMARY_0101: AutomationStudioFlowLessSummary = {
  instructions: "Give me a table with columns title, company, salary and link, newest posting first.",
  rows: {
    totalRows: 7,
    truncated: false,
    columns: ["title", "company", "salary", "link"].map((id) => ({ id, label: id })),
    rows: (DIAGNOSIS_0101.checked ?? []).map((cell, index) => ({ title: cell.row, company: `Employer ${index + 1}`, salary: cell.value, link: `/viewjob?jk=${index + 1}` }))
  },
  acts: []
};

const PLANTS: AutomationStudioFlowLessSummary = {
  instructions: "List the perennials no taller than a metre, with their heights.",
  rows: { totalRows: 2, truncated: false, columns: [{ id: "name", label: "Name" }, { id: "height", label: "Height" }], rows: [{ name: "Lavender", height: "40cm" }, { name: "Foxglove", height: "150cm" }] },
  acts: []
};

function scripted(response: Record<string, unknown>): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    estimateCostUsd: () => 0.001,
    runTask: async () => ({ response, usage: USAGE }) as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>
  };
}

const judge = (summary: AutomationStudioFlowLessSummary, response: Record<string, unknown>) =>
  automationStudioFlowLessJudge({ summary, provider: scripted(response), run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [] });
const plantNo = (diagnosis: Record<string, unknown>) => judge(PLANTS, { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "no", checked: [], answerRecords: { asked: true, siteShows: 1 }, ...diagnosis } });

describe("a Flow-less no that names no contradiction", () => {
  it("is unknown for 0101's reply as recorded: nothing in observed, a value it also checked as right, and a defect of kind other", async () => {
    expect(automationStudioFlowLessNoNamesContradiction(DIAGNOSIS_0101)).toBe(false);
    const judged = await judge(SUMMARY_0101, REPLY_0101);
    expect(judged.verdict).toBe("unsure");
    expect(judged.reason).toMatch(/^The check answered no without naming a contradiction in the evidence/u);
    // Its own words follow Core's, so the model that goes on reads what it said was missing.
    expect(judged.reason).toContain("Evidence needed: the posted values of the final rows.");
    expect(judged.found).toBeUndefined();
  });

  it("is unknown with only defects of kind other, or none, and nothing in observed", async () => {
    expect((await plantNo({ defects: [{ kind: "other", row: "the whole result", requestWords: "with their heights" }] })).verdict).toBe("unsure");
    expect((await plantNo({ defects: [] })).verdict).toBe("unsure");
  });

  it("stays a no where it says in observed what is wrong", async () => {
    const judged = await plantNo({ observed: "Foxglove is 150cm, taller than a metre.", defects: [{ kind: "other", row: "Foxglove", requestWords: "no taller than a metre" }] });
    expect(judged.verdict).toBe("no");
  });

  it("stays a no where a defect names a row, an act, or a value it did not give as right", async () => {
    expect((await plantNo({ defects: [{ kind: "kept_not_asked", row: "Foxglove", column: "height", value: "150cm", requestWords: "no taller than a metre" }] })).verdict).toBe("no");
    expect((await plantNo({ defects: [{ kind: "asked_missing", row: "Catmint", requestWords: "the perennials" }] })).verdict).toBe("no");
    expect((await plantNo({ defects: [{ kind: "wrong_value", row: "Foxglove", column: "height", value: "150cm", requestWords: "with their heights" }], checked: [{ row: "Lavender", column: "height", value: "40cm" }] })).verdict).toBe("no");
  });

  it("is a judge's no, never a yes or an unknown, and the question says how it is read", () => {
    expect(automationStudioFlowLessNoNamesContradiction({ answersRequest: "yes" })).toBe(true);
    expect(automationStudioFlowLessNoNamesContradiction({ answersRequest: "unknown" })).toBe(true);
    expect(automationStudioFlowLessNoNamesContradiction(undefined)).toBe(true);
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("names no contradiction and is read as unknown");
  });
});
