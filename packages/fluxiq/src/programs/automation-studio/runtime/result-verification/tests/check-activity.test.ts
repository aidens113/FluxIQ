import { describe, expect, it } from "vitest";
import { automationStudioResultCheckActivity } from "../check-activity.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultVerificationAgreement } from "../agreement.ts";
import { automationStudioResultVerdict } from "../verdict.ts";

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 3,
  totalRefusedCount: 0,
  totalRowsMissingRequired: 0,
  recordSetCount: 1,
  recordSets: [],
  flowShape: [{ nodeId: "n1", definitionId: "navigate" }],
  withheld: false
};

const performed = (verification: ReturnType<typeof automationStudioResultVerdict>): AutomationStudioResultVerificationOutcome => ({ ...verification, performed: true });

describe("automationStudioResultCheckActivity", () => {
  it("says a result that answers as a pass, in Core's sentence", () => {
    const words = automationStudioResultCheckActivity(performed(automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes" }, basis: "model" })));
    expect(words).toEqual({ label: "The result answers the request", status: "succeeded", text: "The result was judged to answer the request." });
  });

  it("says a refuted result as a failure with what the check found and advised", () => {
    const refuted = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", observed: "Only three listings were saved", changed: "Read every page of results" }, basis: "model" });
    const words = automationStudioResultCheckActivity(performed(automationStudioResultVerificationAgreement({ first: refuted, second: refuted })));
    expect(words.label).toBe("The result doesn't answer the request");
    expect(words.status).toBe("failed");
    expect(words.text).toContain("judged not to answer the request");
    expect(words.text).toContain("What it found: Only three listings were saved");
    expect(words.text).toContain("What to change: Read every page of results");
    expect(words.text).not.toMatch(/core\.result\./u);
  });

  it("says an unconfirmed result is not a pass, and a skipped check plainly", () => {
    const no = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no" }, basis: "model" });
    const yes = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes" }, basis: "model" });
    const unconfirmed = automationStudioResultCheckActivity(performed(automationStudioResultVerificationAgreement({ first: no, second: yes })));
    expect(unconfirmed).toMatchObject({ label: "Couldn't confirm the result answers the request", status: "failed" });
    const skipped = automationStudioResultCheckActivity({ schemaVersion: "automation-studio.result-verification.v1", performed: false, code: "core.result.no_model_available", reason: "No model was available to judge this run's result." });
    expect(skipped).toEqual({ label: "The result couldn't be checked", status: "failed", text: "No model was available to judge this run's result." });
  });
});
