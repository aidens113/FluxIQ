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

  // Run `run-murwd8le-79e735a8` (UI review D3): the person read "...the model
  // judged that it does not answer the request and then that it answers the
  // request. Neither answer is taken over the other, so the result is
  // unverified and the run keeps the status its steps earned."
  it("says an unsettled result in words a person reads, keeping what it means and its codes", () => {
    const disagreed = automationStudioResultVerificationAgreement({ first: said("no"), second: said("yes") });
    const unconfirmed = automationStudioResultVerificationAgreement({ first: said("no"), second: said("unknown") });
    for (const agreed of [disagreed, unconfirmed]) {
      expect(agreed.reason).not.toMatch(/\bmodel\b|status its steps earned|two checks/iu);
      expect(agreed.reason).toContain("checked twice with the same evidence");
      expect(agreed.reason).toContain("not confirmed");
      expect(agreed.reason).toContain("not marked as failed");
    }
    expect(disagreed.reason).toBe("This result was checked twice with the same evidence, and the answers differed: the first was that it does not do what was asked, the second that it does. Neither answer counts for more than the other, so the result is not confirmed, and the run is not marked as failed for it.");
    expect(disagreed.code).toBe("core.result.verdicts_disagree");
    expect(unconfirmed.reason).toContain("core.result.verdict_unsure");
    expect(unconfirmed.code).toBe("core.result.refutation_unconfirmed");
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

// Live run murwcmx2 (step 0035): the first call judged `no` and advised
// narrowing the read's name condition; the second did not come back usable. The
// unsettled outcome dropped the first call's reading, so the repair was told
// only "unverified" and completed the unchanged Flow. The reading of the call
// that judged `no` is carried as one unconfirmed reading -- never a failure
// record, never a repair, and the run still does not fail on it.
describe("an unsettled verification carries the reading of the call that judged no", () => {
  const reading = { expected: "Every pair under $50, earbuds with a charging case included.", observed: "The name condition alone left out earbuds sold with a charging case.", changed: "Narrow the name condition to accessory-only titles." };
  const saidNo = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", ...reading }, basis: "model" });
  const said_unknown = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "unknown", observed: "I could not tell." }, basis: "model" });
  const expectedReading = { expected: reading.expected, observed: reading.observed, advice: reading.changed };

  it("run murwcmx2: a no, then a call that did not come back, is unconfirmed and carries the no's expected, observed and advice", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: saidNo(), second: unavailable() });
    expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", calls: 2 });
    expect(agreed.unconfirmedReading).toEqual(expectedReading);
    expect(agreed.failure).toBeUndefined();
    expect(agreed.repair).toBeUndefined();
    expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
  });

  it("carries the reading of whichever call judged no: the first, or the second after an unknown", () => {
    for (const [first, second, basis] of [
      [saidNo(), said_unknown(), "model_unconfirmed"],
      [saidNo(), silent(), "model_unconfirmed"],
      [saidNo(), said("yes"), "model_disagreed"],
      [said_unknown(), saidNo(), "model_unconfirmed"]
    ] as const) {
      const agreed = automationStudioResultVerificationAgreement({ first, second });
      expect(agreed.basis).toBe(basis);
      expect(agreed.unconfirmedReading, `${first.verdict} then ${second.verdict}`).toEqual(expectedReading);
      expect(agreed.failure).toBeUndefined();
      expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
    }
  });

  it("carries none where no call judged no, or the no said nothing beyond its verdict", () => {
    for (const [first, second] of [[said_unknown(), said_unknown()], [said_unknown(), said("yes")], [said("no"), unavailable()]] as const) {
      expect(automationStudioResultVerificationAgreement({ first, second })).not.toHaveProperty("unconfirmedReading");
    }
  });

  it("is a copy: changing the outcome's reading leaves the call's directive as it was", () => {
    const first = saidNo();
    const agreed = automationStudioResultVerificationAgreement({ first, second: unavailable() });
    agreed.unconfirmedReading!.advice = "changed";
    expect(first.repair?.judgement?.advice).toBe(reading.changed);
  });
});

// Live run murwcmx2 (build judges 0032 and 0051): the same request, byte for
// byte but one step number, was answered `no` and then `yes` (confidence 0.9),
// and the one `yes` finished the build on the 10 rows the playback judge
// refused. A build-test verification therefore confirms a first `yes` with a
// second call; the runtime result check does not.
describe("a verification that confirms a first yes (the build-test judge)", () => {
  const reading = { expected: "Every pair under $50, earbuds sold with a charging case included.", observed: "Three earbuds with a Wireless Charging Case were left out by the name condition.", changed: "Narrow the name condition to accessory-only titles." };
  const saidNo = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", ...reading }, basis: "model" });

  it("asks again after a yes only when the verification confirms answers; never after a silent or unavailable first call", () => {
    expect(automationStudioResultVerificationAskAgain(said("yes"), { confirmAnswer: true })).toBe(true);
    expect(automationStudioResultVerificationAskAgain(said("yes"), { confirmAnswer: false })).toBe(false);
    expect(automationStudioResultVerificationAskAgain(said("no"), { confirmAnswer: true })).toBe(true);
    expect(automationStudioResultVerificationAskAgain(silent(), { confirmAnswer: true })).toBe(false);
    expect(automationStudioResultVerificationAskAgain(unavailable(), { confirmAnswer: true })).toBe(false);
  });

  it("yes, yes is a yes asked twice", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: said("yes"), second: said("yes"), confirmAnswer: true });
    expect(agreed).toMatchObject({ verdict: "answers", basis: "model", code: "core.result.answers_request", verdicts: ["answers", "answers"], calls: 2 });
    expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
  });

  it("run murwcmx2: yes, then no, is disagreed and unsure, carrying the no's reading -- never a yes", () => {
    // Mutation: let the first yes stand. The build then finishes on rows a second look refused.
    const agreed = automationStudioResultVerificationAgreement({ first: said("yes"), second: saidNo(), confirmAnswer: true });
    expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_disagreed", code: "core.result.verdicts_disagree", verdicts: ["answers", "does_not_answer"], calls: 2 });
    expect(agreed.reason).toContain("the first was that it does what was asked, the second that it does not");
    expect(agreed.unconfirmedReading).toEqual({ expected: reading.expected, observed: reading.observed, advice: reading.changed });
    expect(agreed.failure).toBeUndefined();
    expect(agreed.repair).toBeUndefined();
  });

  it("a second unknown or silent reply leaves a confirming yes unverified", () => {
    for (const second of [said("unknown"), silent()]) {
      const agreed = automationStudioResultVerificationAgreement({ first: said("yes"), second, confirmAnswer: true });
      expect(agreed, second.code).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.refutation_unconfirmed", verdicts: ["answers", "unsure"], calls: 2 });
      expect(agreed.failure).toBeUndefined();
      expect(agreed).not.toHaveProperty("unconfirmedReading");
    }
  });

  // Live run run-mux6nxst-c9bca37c (D3-5): the reserve judgement's first call
  // said yes and the purse refused the confirming second, which verify reads as
  // a call that did not come back usable. That one unconfirmed yes finished the build.
  it("run mux6nxst: yes, then a confirming call that did not come back usable, is unconfirmed and unsure -- never a yes", () => {
    // Mutation: let the first yes stand over an unavailable second. One unconfirmed yes then finishes a build.
    for (const second of [unavailable(), automationStudioResultVerdict({ summary, basis: "model_unavailable", failureCode: "llm_budget.run_call_limit" })]) {
      const agreed = automationStudioResultVerificationAgreement({ first: said("yes"), second, confirmAnswer: true });
      expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.refutation_unconfirmed", verdicts: ["answers", "unsure"], calls: 2 });
      expect(agreed.reason).toBe(`This result was checked once: the first answer was that it does what was asked, and the second check, which confirms a yes, gave no answer, because it did not come back usable (${second.code}). That does not show the run went wrong, so the result is not confirmed, and the run is not marked as failed for it.`);
      expect(agreed.reason).not.toMatch(/\bmodel\b/iu);
      expect(agreed).not.toHaveProperty("unconfirmedReading");
      expect(agreed.failure).toBeUndefined();
      expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
      // The runtime result check, which never confirms a yes, is unchanged.
      expect(automationStudioResultVerificationAgreement({ first: said("yes"), second })).toMatchObject({ verdict: "answers", verdicts: ["answers"], calls: 1 });
    }
  });

  it("a required confirming verdict that is absent cannot preserve the first yes", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: said("yes"), confirmAnswer: true });
    expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.refutation_unconfirmed", verdicts: ["answers"], calls: 1 });
    expect(agreed.failure).toBeUndefined();
    expect(agreed.reason).toContain("confirming check was not supplied");
  });

  it("without the option a second verdict after a yes is ignored, as the runtime result check always has", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: said("yes"), second: saidNo() });
    expect(agreed).toMatchObject({ verdict: "answers", verdicts: ["answers"], calls: 1 });
  });
});
