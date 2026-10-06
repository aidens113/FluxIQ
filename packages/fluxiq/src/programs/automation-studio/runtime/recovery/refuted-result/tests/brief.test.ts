// What the repair build is told. The defect it closes: run-mulwm2dc-0bd95f22's
// re-author was given a Flow id and a mode, and rebuilt the same
// unfiltered extraction the check had just refuted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { resolveAutomationStudioLlmInstructions } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_REAUTHOR_BRIEF_INSTRUCTION_ID, automationStudioReauthorBrief } from "../brief.ts";
import { automationStudioResultRepairHistoryEntry } from "../history.ts";
import { automationStudioResultReadAccounts } from "../../../result-verification/read-account/index.ts";
import { EARBUDS_LOCATORS, EARBUDS_NODE_ID, earbudsAttempt, earbudsNode } from "../../../result-verification/read-account/tests/earbuds-read.ts";

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

  it("says how the read went: its pages, its stop, and the rows each of its conditions rejected", () => {
    // run-munq5s8x-6d620cdf: the re-author was told "8 records stored" of a read
    // that had paged five times and filtered on four conditions, while the step's
    // own parameters had been cut for room. It could not know which condition
    // dropped the true earbuds, nor that paging already existed.
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt()], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    const refuted = automationStudioResultRepairHistoryEntry({ attempt: 1, outcome, summary: { ...summary(), reads }, nodeId: "node.s3" });
    const brief = automationStudioReauthorBrief({ projectId: "p", flowId: "f", current: refuted, history: [], maxAttempts: 3, now: 5 });
    expect(brief.body).toContain(`How the read went: Step ${EARBUDS_NODE_ID} read 5 pages of at most 5, paging stopped on page_limit and kept 8 of 56 items seen.`);
    expect(brief.body).toContain("It already follows pages");
    expect(brief.body).toContain("It already keeps one row per url.");
    expect(brief.body).toContain("attribute data-sponsored is absent rejected 13 rows; rating atLeast 4 rejected 20 rows; price lessThan 50 rejected 27 rows; name not contains [\"ear tips\", \"charging case\"] rejected 16 rows");
    expect(brief.body).toContain("change that setting or condition in place instead of adding a step for it");
    for (const locator of EARBUDS_LOCATORS) expect(brief.body).not.toContain(locator);
  });

  it("says Core's account of the read stands where the check's advice contradicts it", () => {
    // run-musp39u8-9ac026ab (R6): the brief carried Core's account that the read
    // had already read every page and the check's advice to raise the page
    // bound, then said to make every fix the advice named. The re-author raised
    // the bound six times per try and reread the same rows.
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt()], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    const raise = { ...outcome, repair: { ...outcome.repair!, judgement: { ...outcome.repair!.judgement, advice: "Raise maxPages to 60 so every item is read." } } };
    const refuted = automationStudioResultRepairHistoryEntry({ attempt: 1, outcome: raise, summary: { ...summary(), reads }, nodeId: "node.s3" });
    const body = automationStudioReauthorBrief({ projectId: "p", flowId: "f", current: refuted, history: [], maxAttempts: 3, now: 5 }).body;
    expect(body).toContain("How the read went:");
    expect(body).toContain("The check's advice: Raise maxPages to 60");
    const steps = body.slice(body.indexOf("What to do:"));
    const step3 = steps.slice(steps.indexOf("\n3. "), steps.indexOf("\n4. "));
    expect(step3).toContain("Where the check's advice contradicts \"How the read went\" (Core's account of what the step did)");
    expect(step3).toContain("Core's account stands and that part of the advice is not followed");
    // The rest of step 3 is kept.
    expect(step3).toContain("Act on the check's findings and advice above.");
    expect(step3).toContain("change that setting or condition in place instead of adding a step for it");
    expect(step3).toContain("A condition that rejected rows the request wanted is the one to correct.");
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
