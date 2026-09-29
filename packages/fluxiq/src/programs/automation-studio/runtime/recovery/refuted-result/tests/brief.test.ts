// What the repair build is told. The defect it closes: run-mulwm2dc-0bd95f22's
// re-author was given a Flow id, a mode and a grant, and rebuilt the same
// unfiltered extraction the check had just refuted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { resolveAutomationStudioLlmInstructions } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_REAUTHOR_BRIEF_INSTRUCTION_ID, automationStudioReauthorBrief } from "../brief.ts";
import { automationStudioResultRepairHistoryEntry } from "../history.ts";

const ADVICE = "Fix the title field so it holds the item's text rather than its address, and add filtering, dedupe and sort.";

function summary(title = "https://example.test/item/1"): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 12, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{ datasetId: "dataset.1", recordCount: 12, refusedCount: 0, truncated: false, columns: ["title", "salary"], columnsWithheld: false, rowsChecked: 12, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ title }] }],
    flowShape: [{ nodeId: "node.s3", definitionId: "domain.read_list", parameters: { fields: { title: "col.1@href" } } }],
    withheld: false
  };
}

const outcome: AutomationStudioResultVerificationOutcome = {
  schemaVersion: "automation-studio.result-verification.v1",
  performed: true, verdict: "does_not_answer", basis: "model", code: "core.result.does_not_answer_request",
  reason: "The result was judged not to answer the request.", observation: "12 records stored, across 1 record set.",
  repair: {
    schemaVersion: "automation-studio.result-repair-directive.v1",
    findings: [{ code: "result.counts_look_right", detail: "Nothing in the counts is wrong." }],
    fix: ["The counts look right, so compare which rows and values were kept against the request."],
    judgement: { expected: "Remote roles in the UK paying at least the floor, newest first.", observed: "Twelve rows, every title an address.", advice: ADVICE }
  }
};

const entry = (attempt: number, title?: string) => automationStudioResultRepairHistoryEntry({ attempt, outcome, summary: summary(title), nodeId: "node.s3" });

describe("the repair brief", () => {
  it("tells the build it is a repair, what the run stored, and what Core and the check said", () => {
    const brief = automationStudioReauthorBrief({ projectId: "p", flowId: "f", current: entry(1), history: [], maxAttempts: 3, now: 5 });
    expect(brief).toMatchObject({ instructionId: AUTOMATION_STUDIO_REAUTHOR_BRIEF_INSTRUCTION_ID, scope: { kind: "flow", projectId: "p", flowId: "f" }, status: "active" });
    expect(brief.body).toContain("repair attempt 1 of at most 3");
    expect(brief.body).toContain("12 rows in total (12 rows with columns title, salary)");
    expect(brief.body).toContain("authored with parameters {\"fields\":{\"title\":\"col.1@href\"}}");
    expect(brief.body).toContain("Core's fix: The counts look right");
    expect(brief.body).toContain(`The check's advice: ${ADVICE}`);
    expect(brief.body).toContain("Leaving a clause out to be narrowed later is no longer right: this repair is the later.");
    expect(brief.body).not.toContain("Earlier repair attempts");
  });

  it("shows each earlier attempt, and says outright when one changed nothing", () => {
    const brief = automationStudioReauthorBrief({ projectId: "p", flowId: "f", current: entry(2), history: [entry(1)], maxAttempts: 3, now: 5 });
    expect(brief.body).toContain("Attempt 1 repaired the answer below and its Flow then produced 12 rows in total");
    expect(brief.body).toContain("exactly the same answer as before the repair");
    expect(brief.body).toContain("The last repair did not change the answer. Make a different change this time");
  });

  it("does not claim an unchanged answer for an attempt that changed it", () => {
    const brief = automationStudioReauthorBrief({ projectId: "p", flowId: "f", current: entry(2, "Senior Engineer"), history: [entry(1)], maxAttempts: 3, now: 5 });
    expect(brief.body).not.toContain("exactly the same answer");
  });

  it("sorts after the person's own instruction and never pushes it out of the budget", () => {
    const brief = automationStudioReauthorBrief({ projectId: "p", flowId: "f", current: entry(3), history: [entry(1), entry(2)], maxAttempts: 3, now: 5 });
    expect(brief.body.length).toBeLessThanOrEqual(6_000);
    const person = { ...brief, instructionId: "instruction.goal", title: "Goal", body: "Find remote Rust roles in the UK paying at least 90,000, newest first.", priority: 0 };
    const resolved = resolveAutomationStudioLlmInstructions({ instructions: [brief, person], projectId: "p", flowId: "f", tokenBudget: 4_000 });
    expect(resolved.instructionIds).toEqual(["instruction.goal", AUTOMATION_STUDIO_REAUTHOR_BRIEF_INSTRUCTION_ID]);
    // A required instruction pair that says both "always" and "never" is refused as a conflict; the brief says neither.
    expect(resolved.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });
});
