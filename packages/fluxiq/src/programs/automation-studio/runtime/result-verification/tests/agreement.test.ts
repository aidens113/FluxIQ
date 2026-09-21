import { describe, expect, it } from "vitest";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultVerification, type AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationAskAgain } from "../agreement.ts";
import { automationStudioResultVerdict } from "../verdict.ts";

// What two checks of one result come to. Any answer the model gave other than
// `yes` is asked again; only two agreeing `no`s fail the run. On 2026-09-18 the
// same 14 rows were judged both ways, and on 2026-09-21 a Lab run that matched
// 14 of 14 was failed on a single `unknown`.

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 14,
  totalRefusedCount: 0,
  totalRowsMissingRequired: 0,
  recordSetCount: 1,
  recordSets: [],
  flowShape: [{ nodeId: "n1", definitionId: "navigate" }, { nodeId: "n2", definitionId: "extract" }],
  withheld: false
};

const said = (answersRequest: "yes" | "no" | "unknown"): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: { answersRequest }, basis: "model" });
const silent = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary, diagnosis: {}, basis: "model" });
const unavailable = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary, basis: "model_unavailable", failureCode: "llm.provider_timeout" });

describe("automationStudioResultVerificationAskAgain", () => {
  it("asks again after a no or an unknown, and never after a yes, a silent reply or a call that did not come back", () => {
    expect(automationStudioResultVerificationAskAgain(said("no"))).toBe(true);
    expect(automationStudioResultVerificationAskAgain(said("unknown"))).toBe(true);
    expect(automationStudioResultVerificationAskAgain(said("yes"))).toBe(false);
    expect(automationStudioResultVerificationAskAgain(silent())).toBe(false);
    expect(automationStudioResultVerificationAskAgain(unavailable())).toBe(false);
  });
});

describe("automationStudioResultVerificationAgreement", () => {
  it("keeps a first answer that the result answers, as one call", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: said("yes") });
    expect(agreed).toMatchObject({ verdict: "answers", basis: "model", code: "core.result.answers_request", verdicts: ["answers"], calls: 1 });
    expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
  });

  it("refutes only when both checks say the result does not answer, and says it was asked twice", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: said("no"), second: said("no") });
    expect(agreed).toMatchObject({ verdict: "does_not_answer", basis: "model", code: "core.result.does_not_answer_request", verdicts: ["does_not_answer", "does_not_answer"], calls: 2 });
    expect(agreed.reason).toContain("twice");
    expect(agreed.failure?.code).toBe("core.result.does_not_answer_request");
    expect(automationStudioResultVerificationFailsRun(agreed)).toBe(true);
  });

  it("leaves any pair with one yes in it unverified as disagreed, and does not fail the run", () => {
    // Mutation: take the first answer over the second. The run then fails on
    // a no or an unknown the model did not repeat.
    for (const [first, words] of [[said("no"), ["does_not_answer", "answers"]], [said("unknown"), ["unsure", "answers"]]] as const) {
      const agreed = automationStudioResultVerificationAgreement({ first, second: said("yes") });
      expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_disagreed", code: "core.result.verdicts_disagree", verdicts: words, calls: 2 });
      expect(agreed.failure).toBeUndefined();
      expect(agreed.observation).toBe(first.observation);
      expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
    }
  });

  it("leaves two answers that never said yes and never agreed on no unverified as unconfirmed, not refuted", () => {
    // Mutation: refute on any pair without a yes. `unknown, unknown` then
    // fails a run that nobody showed to be wrong.
    const pairs = [
      [said("unknown"), said("unknown"), ["unsure", "unsure"], "core.result.verdict_unsure"],
      [said("unknown"), said("no"), ["unsure", "does_not_answer"], "core.result.does_not_answer_request"],
      [said("no"), said("unknown"), ["does_not_answer", "unsure"], "core.result.verdict_unsure"],
      [said("no"), silent(), ["does_not_answer", "unsure"], "core.result.verdict_absent"],
      [said("unknown"), unavailable(), ["unsure", "unsure"], "core.result.verdict_unavailable"]
    ] as const;
    for (const [first, second, words, secondCode] of pairs) {
      const agreed = automationStudioResultVerificationAgreement({ first, second });
      expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.refutation_unconfirmed", verdicts: words, calls: 2 });
      expect(agreed.reason).toContain(secondCode);
      expect(agreed.failure).toBeUndefined();
      expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
    }
  });

  it("lets a first call that gave no answer fail closed, as one call, whatever a second might have said", () => {
    // Mutation: combine a first silent reply with a second yes -- the run would
    // then pass on a call that never answered.
    for (const first of [silent(), unavailable()]) {
      const agreed = automationStudioResultVerificationAgreement({ first, second: said("yes") });
      expect(agreed).toMatchObject({ verdict: "unsure", basis: first.basis, code: first.code, verdicts: ["unsure"], calls: 1 });
      expect(automationStudioResultVerificationFailsRun(agreed)).toBe(true);
    }
  });
});
