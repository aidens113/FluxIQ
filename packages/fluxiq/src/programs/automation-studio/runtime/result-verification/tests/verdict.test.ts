import { describe, expect, it } from "vitest";
import { automationStudioResultVerificationAnswers, type AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultVerdict, automationStudioResultVerdictFromDiagnosis } from "../verdict.ts";

// The fail-closed rule, stated once and asserted from every direction.
//
// Only an explicit `yes` lets a run keep reporting success. An `unknown`, an
// omitted field, a reply with no diagnosis object at all and a call that never
// came back are the same fact -- nobody confirmed the result -- and a run that
// reported success on that basis is the failure this module exists for.

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 240,
  totalRefusedCount: 0,
  totalRowsMissingRequired: 0,
  recordSetCount: 1,
  recordSets: [],
  flowShape: [{ nodeId: "n1", definitionId: "navigate" }, { nodeId: "n2", definitionId: "extract" }],
  withheld: false
};

describe("automationStudioResultVerdictFromDiagnosis", () => {
  it("reads the three answers, and reads anything else as unsure", () => {
    expect(automationStudioResultVerdictFromDiagnosis({ answersRequest: "yes" })).toBe("answers");
    expect(automationStudioResultVerdictFromDiagnosis({ answersRequest: "no" })).toBe("does_not_answer");
    expect(automationStudioResultVerdictFromDiagnosis({ answersRequest: "unknown" })).toBe("unsure");
    expect(automationStudioResultVerdictFromDiagnosis({})).toBe("unsure");
    expect(automationStudioResultVerdictFromDiagnosis(undefined)).toBe("unsure");
  });
});

describe("automationStudioResultVerdict", () => {
  it("lets a yes answer, and records no failure", () => {
    const verification = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes" }, basis: "model" });
    expect(verification.verdict).toBe("answers");
    expect(verification.failure).toBeUndefined();
    expect(automationStudioResultVerificationAnswers(verification)).toBe(true);
  });

  it("fails a run the model says does not answer, and says what was there", () => {
    const verification = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no" }, basis: "model" });
    expect(verification.verdict).toBe("does_not_answer");
    expect(automationStudioResultVerificationAnswers(verification)).toBe(false);
    expect(verification.failure?.category).toBe("output_not_observed");
    expect(verification.observation).toContain("240 records stored");
    expect(verification.observation).toContain("navigate, extract");
  });

  it("fails closed on unsure", () => {
    // Mutation: treat `unsure` as answering. Returning `answers` for
    // `unknown`, or letting `automationStudioResultVerificationAnswers` pass
    // anything but `answers`, makes both assertions fail.
    const verification = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "unknown" }, basis: "model" });
    expect(verification.verdict).toBe("unsure");
    expect(automationStudioResultVerificationAnswers(verification)).toBe(false);
    expect(verification.failure?.category).toBe("ambiguous_or_unknown");
    expect(verification.code).toBe("core.result.verdict_unsure");
  });

  it("fails closed on a reply that never said", () => {
    const verification = automationStudioResultVerdict({ summary, diagnosis: { observed: "a list of members" }, basis: "model" });
    expect(verification.verdict).toBe("unsure");
    expect(verification.code).toBe("core.result.verdict_absent");
    expect(verification.failure).toBeDefined();
  });

  it("fails closed on a call that never came back, naming the code and not a message", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model_unavailable", failureCode: "llm.provider_timeout" });
    expect(verification.verdict).toBe("unsure");
    expect(verification.code).toBe("core.result.verdict_unavailable");
    expect(verification.reason).toContain("llm.provider_timeout");
    expect(verification.failure).toBeDefined();
  });

  it("never records the model's own prose", () => {
    const verification = automationStudioResultVerdict({
      summary,
      diagnosis: { answersRequest: "no", observed: "the table listed every member of the directory", expected: "two members" },
      basis: "model"
    });
    const recorded = JSON.stringify(verification);
    expect(recorded).not.toContain("the table listed every member");
    expect(recorded).not.toContain("two members");
  });
});
