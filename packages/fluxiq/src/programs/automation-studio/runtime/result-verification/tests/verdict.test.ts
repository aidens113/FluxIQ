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

  it("fails closed on a call that never came back, saying what happened in words and keeping the code on the record", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model_unavailable", failureCode: "llm.provider_timeout" });
    expect(verification.verdict).toBe("unsure");
    expect(verification.code).toBe("core.result.verdict_unavailable");
    expect(verification.reason).not.toContain("llm.provider_timeout");
    expect(verification.reason).toContain("ran out of time");
    expect(verification.failureCode).toBe("llm.provider_timeout");
    expect(verification.failure).toBeDefined();
  });

  // Live run muqk713g (screenshot 00013): the chat read "... did not come back
  // usable (llm_output.invalid_diagnosis_text)". The reason is said in chat, so
  // it names what happened by the code's family; the code stays on the record.
  it.each([
    ["llm_output.invalid_diagnosis_text", "reply could not be read"],
    ["llm.provider_malformed_response", "reply could not be read"],
    ["llm.provider_output_truncated", "reply could not be read"],
    ["llm.provider_timeout", "ran out of time"],
    ["llm.provider_aborted", "was stopped"],
    ["llm.provider_network_error", "could not be reached"],
    ["llm.provider_http_error", "could not be reached"],
    ["llm.provider_rate_limited", "could not be reached"],
    ["llm.provider_auth_failed", "could not be reached"],
    ["llm_budget.run_cost_limit", "spending or size limit"],
    ["llm.provider_input_budget_exceeded", "spending or size limit"],
    ["llm.request.failure_evidence_invalid", "could not be sent"],
    ["llm.provider_credential_in_request", "could not be sent"],
    ["something.new", "did not come back usable"]
  ])("says %s in plain words", (failureCode, words) => {
    const verification = automationStudioResultVerdict({ summary, basis: "model_unavailable", failureCode });
    expect(verification.reason).toContain(words);
    expect(verification.reason).not.toContain(failureCode);
    expect(verification.reason).not.toMatch(/\b[a-z_]+\.[a-z_.]+\b/);
    expect(verification.failureCode).toBe(failureCode);
  });

  it("carries no failure code when the call gave none", () => {
    const verification = automationStudioResultVerdict({ summary, basis: "model_unavailable" });
    expect(verification.reason).toContain("did not come back usable");
    expect("failureCode" in verification).toBe(false);
  });

  // This assertion is the inverse of the one it replaces, and the flip is
  // deliberate. It used to read "never records the model's own prose" over the
  // whole verification object, which was the right rule while a refutation was a
  // verdict and a code. The user's instruction of 2026-09-26 is that the
  // judgement give explicit instructions on what to fix, and the repair is
  // entered with this object's failure record -- of which the recovery context
  // sends the model `expected` and `actual` and nothing else. So the reading
  // survives where a repair can act on it, and the rule it came from survives
  // where it was actually about: what a *run* records
  // (`tests/run-outcome.test.ts` holds that half).
  it("carries the judgement's reading into the refutation and into the failure the repair is entered with", () => {
    const verification = automationStudioResultVerdict({
      summary,
      diagnosis: { answersRequest: "no", observed: "the table listed every member of the directory", expected: "two members", changed: "add a step that types the search term" },
      basis: "model"
    });
    expect(verification.repair?.judgement).toEqual({
      expected: "two members",
      observed: "the table listed every member of the directory",
      advice: "add a step that types the search term"
    });
    expect(verification.failure?.expected).toContain("two members");
    expect(verification.failure?.expected).toContain("add a step that types the search term");
    expect(verification.failure?.actual).toContain("the table listed every member of the directory");
  });

  it("keeps the judgement's prose out of a verdict that is not a refutation", () => {
    // Mutation: build the directive for an `unsure` too. Nobody judged the
    // result wrong, so there is nothing to instruct a repair to change, and
    // `recovery/refuted-result/attempt.ts` refuses to build one from an `unsure`
    // for the same reason.
    const verification = automationStudioResultVerdict({
      summary,
      diagnosis: { answersRequest: "unknown", observed: "the table listed every member of the directory", expected: "two members" },
      basis: "model"
    });
    expect(verification.repair).toBeUndefined();
    const recorded = JSON.stringify(verification);
    expect(recorded).not.toContain("the table listed every member");
    expect(recorded).not.toContain("two members");
  });

  it("stands on Core's own findings when the judgement says nothing beyond no", () => {
    const verification = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no" }, basis: "model" });
    expect(verification.verdict).toBe("does_not_answer");
    expect(verification.repair?.judgement).toBeUndefined();
    expect(verification.repair?.findings.map((finding) => finding.code)).toEqual(["result.counts_look_right"]);
    expect(verification.repair?.fix[0]).toContain("n2 (extract)");
    expect(verification.failure?.expected).toContain("To fix:");
  });

  it("takes the reply's own summary as the advice where the diagnosis gave none", () => {
    const verification = automationStudioResultVerdict({
      summary,
      diagnosis: { answersRequest: "no" },
      summaryText: "the Flow never narrowed the list",
      basis: "model"
    });
    expect(verification.repair?.judgement?.advice).toBe("the Flow never narrowed the list");
  });

  it("does not let a malformed suggestion cost the verdict", () => {
    // Every one of these is a shape the model could produce and none of them may
    // refuse a refutation: a wrong type, whitespace, an oversized field, and a
    // sentence with a credential in it.
    const verification = automationStudioResultVerdict({
      summary,
      diagnosis: {
        answersRequest: "no",
        expected: 7 as unknown as string,
        observed: "   ",
        changed: `every row was kept ${"x".repeat(900)}`
      },
      basis: "model"
    });
    expect(verification.verdict).toBe("does_not_answer");
    expect(verification.code).toBe("core.result.does_not_answer_request");
    expect(verification.repair?.judgement?.expected).toBeUndefined();
    expect(verification.repair?.judgement?.observed).toBeUndefined();
    // Carried whole since 2026-09-30; it was cut at 500 characters.
    expect(verification.repair?.judgement?.advice).toBe(`every row was kept ${"x".repeat(900)}`);
    expect(verification.repair?.findings.length).toBeGreaterThan(0);
  });

  it("drops a credential-shaped suggestion, keeps the verdict, and says something was withheld", () => {
    const verification = automationStudioResultVerdict({
      summary,
      diagnosis: { answersRequest: "no", changed: "sign in with Bearer abcd1234efgh5678ijkl9012 first" },
      basis: "model"
    });
    expect(verification.verdict).toBe("does_not_answer");
    expect(verification.repair?.judgement?.advice).toBeUndefined();
    expect(verification.repair?.withheld).toBe(true);
    expect(JSON.stringify(verification)).not.toContain("abcd1234efgh5678ijkl9012");
  });

  it("redacts a locator out of the judgement's sentence rather than dropping the sentence", () => {
    const verification = automationStudioResultVerdict({
      summary,
      diagnosis: { answersRequest: "no", observed: "every row under [data-testid=\"row\"] was kept" },
      basis: "model"
    });
    expect(verification.repair?.judgement?.observed).toBe("every row under [locator withheld] was kept");
    expect(verification.repair?.withheld).toBe(true);
    expect(JSON.stringify(verification)).not.toContain("data-testid");
  });
});
