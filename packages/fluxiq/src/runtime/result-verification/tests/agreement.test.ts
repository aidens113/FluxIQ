import { describe, expect, it, vi } from "vitest";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultVerification, type AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationAskAgain, automationStudioResultVerificationReaskContradicted } from "../agreement/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultVerdict } from "../verdict/index.ts";
import { automationStudioResultVerificationStatus } from "../verification-status.ts";
import { REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS, requestWordsRunSummary, requestWordsWording } from "../request-rows/tests/request-words-fixture.ts";
import { ABSENT_NO, DEDUPE_DOUBT, SCOOP_NO, SOIL_MIX, SOIL_REQUEST_TEXT, SOIL_YES, soilRunSummary, soilWording } from "../request-rows/tests/potting-soil-fixture.ts";

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

// Live run `run-mv5uu9g1-9d80deea` (lane C round 10, trial of revision 3): one call said no, reading the start view's
// pagination as the read's page; the other said yes, reading "14 of 14 results" and no pagination in the end view. Only
// the no's reading reached the model, which then hunted for pages that did not exist (t477). A split now carries both.
describe("a split verification carries both readings, each its own call's", () => {
  const no = { expected: "Every result of the filtered list, all of its pages.", observed: "The start view shows pages 2 to 5, which were never read.", changed: "Make the next-page step press the pagination link." };
  const yes = { expected: "The filtered list's rows that meet the conditions.", observed: "The end view shows 14 of 14 results and no pagination, so the one page is the whole list.", changed: "Nothing to change." };
  const saidNo = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", ...no }, basis: "model" });
  const saidYes = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes", ...yes }, basis: "model" });

  it("keeps what a yes compared, screened, and never its advice", () => {
    expect(saidYes().answeredReading).toEqual({ expected: yes.expected, observed: yes.observed });
    // A credential-shaped sentence is dropped whole, as a no's is (`../judgement-screen.ts`).
    const secret = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes", expected: "use sk-abcd1234efgh5678ijkl9012mnop to sign in", observed: "14 of 14 rows" }, basis: "model" });
    expect(secret.answeredReading).toEqual({ observed: "14 of 14 rows" });
    expect(automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes" }, basis: "model" })).not.toHaveProperty("answeredReading");
  });

  it("no then yes, and yes then no, carry the no's reading and the yes's side by side", () => {
    for (const [first, second, confirmAnswer] of [[saidNo(), saidYes(), false], [saidYes(), saidNo(), true]] as const) {
      const agreed = automationStudioResultVerificationAgreement({ first, second, confirmAnswer });
      expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_disagreed" });
      expect(agreed.unconfirmedReading).toEqual({ expected: no.expected, observed: no.observed, advice: no.changed });
      expect(agreed.answeredReading).toEqual({ expected: yes.expected, observed: yes.observed });
      expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
    }
  });

  it("carries no yes reading where nobody said yes, or the yes went unconfirmed by a non-answer", () => {
    expect(automationStudioResultVerificationAgreement({ first: saidNo(), second: unavailable() })).not.toHaveProperty("answeredReading");
    expect(automationStudioResultVerificationAgreement({ first: saidYes(), second: said("unknown"), confirmAnswer: true })).not.toHaveProperty("answeredReading");
  });
});

// A runtime result check that answers yes and says the Flow needs a change is
// not a clean pass (t515, live run `run-mv6v2hx5-f448e662`, fix 5). The armed
// playback's one check answered yes with `patchNeeded: true`, advising a
// condition be removed; the runtime keeps a single affirmative judgement, so the
// run was recorded confirmed and the chat said "Passed".
describe("a yes that says the Flow needs a change (t515)", () => {
  const CODES = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  const changeSummary: AutomationStudioRunResultSummary = {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 6, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [],
    flowShape: [{ nodeId: "n1", definitionId: "extract_list" }], withheld: false
  };
  const yesAdvising = (patchNeeded?: boolean) => automationStudioResultVerdict({
    summary: changeSummary, basis: "model",
    diagnosis: { answersRequest: "yes", observed: "Six rows, as asked.", changed: "Remove the second condition.", ...(patchNeeded !== undefined ? { patchNeeded } : {}) }
  });

  it("is a yes with a change advised, by its code", () => {
    expect(yesAdvising(true)).toMatchObject({ verdict: "answers", code: CODES.answersWithChangeAdvised });
    expect(yesAdvising(false)).toMatchObject({ verdict: "answers", code: CODES.answers });
    expect(yesAdvising()).toMatchObject({ verdict: "answers", code: CODES.answers });
  });

  it("is not confirmed as a runtime check's single yes, nor failed", () => {
    const outcome = automationStudioResultVerificationAgreement({ first: yesAdvising(true) });
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: CODES.answersWithChangeAdvised, verdicts: ["answers"], calls: 1 });
    expect(outcome.reason).toContain("said the Flow needs a change");
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
    expect(outcome.failure).toBeUndefined();
    expect(outcome.repair).toBeUndefined();
    expect(automationStudioResultVerificationStatus({ ...outcome, performed: true })).toBe("unverified");
    expect(outcome.answeredReading).toEqual({ observed: "Six rows, as asked." });
  });

  it("leaves a runtime check's plain yes confirmed", () => {
    const outcome = automationStudioResultVerificationAgreement({ first: yesAdvising(false) });
    expect(automationStudioResultVerificationStatus({ ...outcome, performed: true })).toBe("confirmed");
  });

  it("leaves a build test's two yeses a yes, its advice unconfirmed as before", () => {
    const outcome = automationStudioResultVerificationAgreement({ first: yesAdvising(true), second: yesAdvising(false), confirmAnswer: true });
    expect(outcome).toMatchObject({ verdict: "answers", verdicts: ["answers", "answers"], calls: 2 });
  });
});

// A yes Core held for its exclusion evidence is said as a field (t611). A8 launch 8 (everything-store): every judge
// answered yes, Core held each yes, and the subflow trial gate could tell only by matching "exclusion evidence" in the
// reason's words (t601). `yesUnconfirmed` is set where every call answered yes, and only there.
const STOCK_SAID = `Copper Garden Tools Pair is left out, as the request says "leaving out out-of-stock items".`;

/** A yes over a row a condition alone left out, whose reason is only the words the request searched by: Core holds it. */
const heldYes = (): AutomationStudioResultVerification => automationStudioResultVerdict({
  summary: requestWordsRunSummary(),
  diagnosis: { answersRequest: "yes", observed: `${STOCK_SAID} Replacement Handle for Garden Tools is left out: it is a part, and the request asks for "garden tools".` },
  basis: "model",
  wording: requestWordsWording()
});
/** A yes Core takes: each left-out row beside the request's own excluding words. */
const takenYes = (): AutomationStudioResultVerification => automationStudioResultVerdict({
  summary: requestWordsRunSummary(),
  diagnosis: { answersRequest: "yes", observed: `${STOCK_SAID} Replacement Handle for Garden Tools is left out, as the request says "replacement parts".` },
  basis: "model",
  wording: requestWordsWording(REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS)
});
const unsureCall = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary: requestWordsRunSummary(), diagnosis: { answersRequest: "unknown" }, basis: "model" });
const unansweredCall = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary: requestWordsRunSummary(), basis: "model_unavailable", failureCode: "llm.provider_timeout" });

describe("a yes Core held for its exclusion evidence (t611)", () => {
  it("is marked on the one call Core held, and never on a yes it took", () => {
    const held = heldYes();
    expect(held).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing", yesUnconfirmed: true });
    expect(takenYes()).toMatchObject({ verdict: "answers" });
    expect(takenYes()).not.toHaveProperty("yesUnconfirmed");
    expect(unsureCall()).not.toHaveProperty("yesUnconfirmed");
  });

  it("is marked on the agreement where both calls answered yes, one or both held", () => {
    for (const [first, second] of [[heldYes(), heldYes()], [heldYes(), takenYes()], [takenYes(), heldYes()]] as const) {
      const agreed = automationStudioResultVerificationAgreement({ first, second, confirmAnswer: true });
      expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.exclusion_evidence_missing", calls: 2, yesUnconfirmed: true });
    }
  });

  it("is absent where the other call could not tell or did not answer: only one judge said yes", () => {
    for (const second of [unsureCall(), unansweredCall()]) {
      const agreed = automationStudioResultVerificationAgreement({ first: heldYes(), second, confirmAnswer: true });
      expect(agreed).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
      expect(agreed).not.toHaveProperty("yesUnconfirmed");
    }
  });

  it("is kept when the held call is the only one asked", () => {
    expect(automationStudioResultVerificationAgreement({ first: heldYes() })).toMatchObject({ verdict: "unsure", yesUnconfirmed: true, calls: 1 });
  });
});

// A8 bigbox `run-mv9a4aj0-f9a81d13` (t628), replayed with stub judges over a run
// of the same shape on another kind of site (`potting-soil-fixture.ts`).
describe("a no that says what a stored row is, and an unsure beside a no (t628)", () => {
  const judged = (answersRequest: "yes" | "no" | "unknown", diagnosis: { expected?: string; observed?: string; changed?: string }): AutomationStudioResultVerification =>
    automationStudioResultVerdict({ summary, diagnosis: { answersRequest, ...diagnosis }, basis: "model" });
  const record = (duplicates = 0) => {
    const run = soilRunSummary(duplicates);
    return { reads: run.reads, recordSets: run.recordSets, wording: soilWording(), summary: run, requestText: SOIL_REQUEST_TEXT };
  };

  // 0080-0082: a yes that missed the stored scoop, and a no naming it and advising to keep only the item asked for.
  it("0081: leaves a no's advice to keep only the item asked for unmarked where it says what a stored row it names is, and asks nothing again", async () => {
    const input = { first: judged("yes", SOIL_YES), second: judged("no", SCOOP_NO), confirmAnswer: true, ...record() };
    const settled = automationStudioResultVerificationAgreement(input);
    expect(settled).toMatchObject({ verdict: "unsure", basis: "model_disagreed", verdicts: ["answers", "does_not_answer"] });
    expect(settled.unconfirmedReading?.advice).toBe(SCOOP_NO.changed);
    // 0082's answer, had the call been asked again: a yes over the scoop. It is never asked, so the no stands.
    const ask = vi.fn(async () => judged("yes", SOIL_YES));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_disagreed", calls: 2 });
  });

  it("0081: still marks that advice without Core's record of the rows, as t515 did", () => {
    const { summary: _run, requestText: _text, ...unrecorded } = record();
    const agreed = automationStudioResultVerificationAgreement({ first: judged("yes", SOIL_YES), second: judged("no", SCOOP_NO), confirmAnswer: true, ...unrecorded });
    expect(agreed.unconfirmedReading?.advice).toMatch(/^Judge call 2 \(Core's check: this advice adds an exclusion the request never states, "exclude scoops, sieves and accessories"/u);
  });

  it("t515's origin still marks: an exclusion by a kind no named row's label says, beside that row, and asks again with the symmetric recheck", async () => {
    // The row's label shares no word with the request, as t515's did: an exclusion that names a word of the request is stated.
    const origin = { ...SCOOP_NO, observed: `"${SOIL_MIX.name}" ($9.47, 4.6) is stored.`, changed: "Add a condition excluding accessories such as the Rootwise Potting Soil Mix row." };
    const input = { first: judged("yes", SOIL_YES), second: judged("no", origin), confirmAnswer: true, ...record() };
    const settled = automationStudioResultVerificationAgreement(input);
    expect(settled.unconfirmedReading?.advice).toContain("\"excluding accessories such as the Rootwise Potting Soil Mix row\"");
    const ask = vi.fn(async (_recheck: string, _call: 1 | 2) => judged("yes", SOIL_YES));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    const recheck = ask.mock.calls[0]![0];
    expect(recheck).toContain("never states as an exclusion");
    // A kept row may be answered no by the request's words naming what it asks for, which the row is not.
    expect(recheck).toContain("words that exclude it, or the words naming what the request asks for, which that row by its own words is not");
    expect(outcome).toMatchObject({ verdict: "answers", calls: 3 });
  });

  // 0063-0066: an unsure doubting the dedupe, which removed nothing, beside a no calling two stored rows absent.
  it("0063: marks the unsure's dedupe doubt contradicted and labels the refuted no's reading", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: judged("unknown", DEDUPE_DOUBT), second: judged("no", ABSENT_NO), confirmAnswer: true, ...record() });
    expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", verdicts: ["unsure", "does_not_answer"], contradictedUnsure: { call: 1, about: "dedupe" } });
    expect(agreed.contradictedUnsure?.record).toContain("The answer's own dedupe removed no row");
    expect(agreed.contradictedUnsure?.record).toContain("\"Mossbank Potting Soil, 25 Quart\" is in the stored rows, and the other copy Core's read saw was left out by condition 1 (sponsored is absent) alone");
    const observed = agreed.unconfirmedReading?.observed ?? "";
    expect(observed).toMatch(/^Judge call 2 \(contradicted by Core's record: "Rootwise Potting Soil Mix, 16 Quart" is in the stored rows\./u);
    expect(observed.endsWith(`: ${ABSENT_NO.observed}`)).toBe(true);
    expect(agreed.unconfirmedReading?.expected).toBe(ABSENT_NO.expected);
    expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
  });

  it("0063: re-asks the doubt with Core's record, and, when it says yes, the refuted no too, so two yeses are a yes", async () => {
    const input = { first: judged("unknown", DEDUPE_DOUBT), second: judged("no", ABSENT_NO), confirmAnswer: true, ...record() };
    const settled = automationStudioResultVerificationAgreement(input);
    const ask = vi.fn(async (_recheck: string, _call: 1 | 2) => judged("yes", SOIL_YES));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask.mock.calls.map((call) => call[1])).toEqual([1, 2]);
    expect(ask.mock.calls[0]![0]).toContain("took the answer's dedupe to have merged distinct rows into one");
    expect(ask.mock.calls[0]![0]).toContain("The answer's own dedupe removed no row");
    expect(ask.mock.calls[1]![0]).toContain("\"Rootwise Potting Soil Mix, 16 Quart\" is in the stored rows.");
    expect(outcome).toMatchObject({ verdict: "answers", verdicts: ["unsure", "does_not_answer", "answers", "answers"], calls: 4, contradictedUnsure: { call: 1, about: "dedupe", reasked: true }, refutedNo: { calls: [2], reasked: true } });
  });

  it("0063: asks the refuted no nothing more where the doubt asked again still cannot tell", async () => {
    const input = { first: judged("unknown", DEDUPE_DOUBT), second: judged("no", ABSENT_NO), confirmAnswer: true, ...record() };
    const settled = automationStudioResultVerificationAgreement(input);
    const ask = vi.fn(async () => judged("unknown", DEDUPE_DOUBT));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ verdict: "unsure", calls: 3, contradictedUnsure: { reasked: true } });
    expect(outcome.unconfirmedReading?.observed).toMatch(/^Judge call 2 \(contradicted by Core's record/u);
  });

  it("leaves a dedupe doubt standing where the dedupe removed a row, and labels a no only in part where a reason stands", () => {
    const removed = automationStudioResultVerificationAgreement({ first: judged("unknown", DEDUPE_DOUBT), second: judged("no", ABSENT_NO), confirmAnswer: true, ...record(1) });
    expect(removed).not.toHaveProperty("contradictedUnsure");
    const standing = { ...ABSENT_NO, observed: `${ABSENT_NO.observed} The seller step keeps only one brand, which is wrong.` };
    const partly = automationStudioResultVerificationAgreement({ first: judged("unknown", DEDUPE_DOUBT), second: judged("no", standing), confirmAnswer: true, ...record() });
    expect(partly.unconfirmedReading?.observed).toMatch(/^Judge call 2 \(Core's record contradicts part of this reading: "Rootwise Potting Soil Mix, 16 Quart" is in the stored rows\./u);
    // Without Core's record nothing is weighed, as before.
    const bare = automationStudioResultVerificationAgreement({ first: judged("unknown", DEDUPE_DOUBT), second: judged("no", ABSENT_NO) });
    expect(bare).not.toHaveProperty("contradictedUnsure");
    expect(bare.unconfirmedReading?.observed).toBe(ABSENT_NO.observed);
  });
});
