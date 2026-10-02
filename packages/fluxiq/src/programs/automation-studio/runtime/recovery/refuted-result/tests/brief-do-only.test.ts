// The repair brief for a Flow that reads nothing. `run-muqiojz4-04a7a8fc`
// (bigbox cart): the brief said "no record set exists" and every "What to do"
// item was about a list read -- conditions, pagination, columns -- so the
// re-author chased those instead of the towel's missing Add to cart.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioResultRepairDirective } from "../../../result-verification/index.ts";
import { automationStudioReauthorBrief } from "../brief.ts";
import { automationStudioResultRepairHistoryEntry } from "../history.ts";

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [],
  flowShape: [
    { nodeId: "s1", definitionId: "web.output.navigate", parameters: { url: "https://shop.example/" } },
    { nodeId: "s2", definitionId: "web.output.dom-click", parameters: { element: { tagName: "button", accessibleName: "Millbrook Crossing" } } },
    { nodeId: "s3", definitionId: "web.output.dom-click", parameters: { element: { tagName: "button", accessibleName: "Add to cart" }, timeoutMs: 10000 } }
  ],
  withheld: false
};

const outcome: AutomationStudioResultVerificationOutcome = {
  schemaVersion: "automation-studio.result-verification.v1",
  performed: true, verdict: "does_not_answer", basis: "model", code: "core.result.does_not_answer_request",
  reason: "The result was judged not to answer the request.", observation: "0 records stored.",
  repair: automationStudioResultRepairDirective({
    summary,
    judgement: { expected: "Switch store; add two packs of towels and one of napkins.", observed: "Only one pack of towels was added.", advice: "Add a second '+' click after s3." }
  })
};

const entry = (attempt: number) => automationStudioResultRepairHistoryEntry({ attempt, outcome, summary, nodeId: "s3" });

const LIST_READ_ADVICE = /step that reads the items|condition list|pagination|column mapping|How the read went|no record set|rows came out of/i;

describe("the repair brief for a Flow that reads nothing", () => {
  it("carries no list-read advice and points at the acts the check found not done", () => {
    const brief = automationStudioReauthorBrief({ projectId: "p", flowId: "f", current: entry(1), history: [], maxAttempts: 3, now: 5 });
    expect(brief.body).not.toMatch(LIST_READ_ADVICE);
    expect(brief.body).toContain("The check's advice: Add a second '+' click after s3.");
    expect(brief.body).toContain("What to do:");
    expect(brief.body).toMatch(/act/);
  });

  it("says nothing about the step that reads the items when an earlier repair changed nothing", () => {
    const brief = automationStudioReauthorBrief({ projectId: "p", flowId: "f", current: entry(2), history: [entry(1)], maxAttempts: 3, now: 5 });
    expect(brief.body).toContain("The last repair did not change the answer.");
    expect(brief.body).not.toMatch(LIST_READ_ADVICE);
  });
});
