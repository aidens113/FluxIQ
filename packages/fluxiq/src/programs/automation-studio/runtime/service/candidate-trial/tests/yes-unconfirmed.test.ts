import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioCandidateTrialFeedback } from "../index.ts";

// A not_judged whose every judge call answered yes, Core holding the yes for its exclusion evidence, carries the fact as
// `yesUnconfirmed` beside `why` (t611): the subflow trial gate reads the field, never the reason's words.
describe("a not_judged trial after a held yes", () => {
  const summary: AutomationStudioRunResultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 3, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [], flowShape: [], withheld: false };
  const spent = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, calls: 2 };
  const why = "The checks did not provide the required exclusion evidence, so the result remains unconfirmed.";

  it("carries yesUnconfirmed from the judge's verdict", () => {
    const { verdict, code, feedback } = automationStudioCandidateTrialFeedback.judged({ verdict: { verdict: "not_judged", why, yesUnconfirmed: true, spent }, summary, trialRunId: "trial.1", start: "reset" });
    expect(verdict).toBe("not_judged");
    expect(code).toBe("candidate.trial_not_judged");
    expect(feedback).toMatchObject({ code: "candidate.trial_not_judged", why, yesUnconfirmed: true });
  });

  it("carries none on any other not_judged, whatever its reason says", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.judged({ verdict: { verdict: "not_judged", why, spent }, summary, trialRunId: "trial.2", start: "reset" });
    expect(feedback).toMatchObject({ code: "candidate.trial_not_judged", why });
    expect(feedback).not.toHaveProperty("yesUnconfirmed");
  });
});
