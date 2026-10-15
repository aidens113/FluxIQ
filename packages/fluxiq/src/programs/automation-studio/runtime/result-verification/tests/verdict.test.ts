import { describe, expect, it } from "vitest";
import { automationStudioResultVerificationAnswers, automationStudioResultVerificationFailsRun, type AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultVerdict, automationStudioResultVerdictFromDiagnosis } from "../verdict.ts";
import {
  REQUEST_WORDS_NAMES, REQUEST_WORDS_HANDLE, REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS, requestWordsRunSummary, requestWordsWording
} from "../request-rows/tests/request-words-fixture.ts";
import { automationStudioResultCheckedRowsNamed } from "../request-rows/index.ts";
import { automationStudioResultRecordedOutcome } from "../run-record.ts";

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
    // What it doubted is kept only as `unsureReading` (t503: an unsure beside a yes is
    // weighed by it, `../agreement.ts`): never in the failure record, and never on a run.
    expect(verification.unsureReading).toEqual({ expected: "two members", observed: "the table listed every member of the directory" });
    for (const recorded of [JSON.stringify(verification.failure), JSON.stringify(automationStudioResultRecordedOutcome({ ...verification, performed: true }))]) {
      expect(recorded).not.toContain("the table listed every member");
      expect(recorded).not.toContain("two members");
    }
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

  // t195-w37 (live run run-murwcaj0-40e56557): a build ends "not doable" only on the judge's own "cannot be had".
  it("carries the diagnosis's stillAchievable on a refutation, and only as one of its three words", () => {
    for (const stillAchievable of ["no", "yes", "unknown"] as const) {
      const verification = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", stillAchievable }, basis: "model" });
      expect(verification.repair?.judgement?.stillAchievable, stillAchievable).toBe(stillAchievable);
    }
    const odd = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", stillAchievable: "maybe" as never }, basis: "model" });
    expect(odd.repair?.judgement?.stillAchievable).toBeUndefined();
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

// t478, lane D round 11 (`run-mv5yaapw-6d20d23d`): three judges named the row a
// digit pattern left out, read it as below the threshold, and said yes. A text
// condition that kept a number on one row and left it out on another is Core's
// to see, so a yes over such a row is not taken, and a no carries the finding.
describe("a yes over a left-out row stating a number its text condition kept", () => {
  const condition = "replies matches [\"([3-9]|[1-9][0-9]+) replies\"]";
  const contradicted: AutomationStudioRunResultSummary = {
    ...summary,
    totalRecordCount: 2,
    recordSets: [{
      datasetId: "threads", recordCount: 2, refusedCount: 0, truncated: false, columns: ["topic", "replies"], columnsWithheld: false,
      rowsChecked: 2, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: [{ topic: "Pruning roses", replies: "14 replies" }, { topic: "Seed swap", replies: "3 replies" }],
      processing: { collected: 2, duplicates: 0, filteredOut: 0, cut: 0, kept: 2, passes: [{ node: "n2", pass: 1, rows: 2, newRows: 2 }] }
    }],
    reads: [{
      nodeId: "n2", definitionId: "extract", pagesRead: 1, truncated: false, kept: 2,
      conditions: [{ condition, rejected: 2, alone: 2, leftOutOnlyByThis: ["Compost bins — replies: Dana Ruiz and 4 others", "Rain barrels — replies: 1 reply"] }]
    }]
  };

  it("is refused even when the yes names the row, and the repair is told the rows, their numbers and the change", () => {
    const verification = automationStudioResultVerdict({
      summary: contradicted,
      diagnosis: { answersRequest: "yes", observed: "Compost bins has fewer than three replies, so it is correctly left out" },
      basis: "model"
    });
    expect(verification.verdict).toBe("does_not_answer");
    expect(verification.code).toBe("core.result.does_not_answer_request");
    expect(verification.reason).toBe("The result was judged to answer the request over rows a text condition alone left out that state a number the same condition kept on another row, so it is not taken as an answer.");
    expect(verification.repair?.findings[0]).toEqual({
      code: "result.left_out_stating_a_kept_number",
      detail: `Read n2: the condition 1 (${condition}) kept rows stating 3 to 14 and alone left out a row that states a number in that range, so it compared characters, not the number: Compost bins — replies: Dana Ruiz and 4 others (states 5).`
    });
    expect(verification.repair?.fix[0]).toContain("write the threshold the request asks for as a bound on that column (atLeast, atMost, greaterThan or lessThan)");
    expect(verification.repair?.checked).toEqual([
      `The check answered yes though the condition 1 (${condition}) (Read n2) kept rows stating 3 to 14 and alone left out this row, which states a number in that range: Compost bins — replies: Dana Ruiz and 4 others (states 5).`
    ]);
    expect(automationStudioResultVerificationAnswers(verification)).toBe(false);
  });

  it("carries the same finding beside a no's own reading", () => {
    const verification = automationStudioResultVerdict({ summary: contradicted, diagnosis: { answersRequest: "no" }, basis: "model" });
    expect(verification.repair?.findings.map((finding) => finding.code)).toContain("result.left_out_stating_a_kept_number");
  });

  it("takes a yes where the text condition left out only numbers outside the range it kept", () => {
    const reads = [{ ...contradicted.reads![0]!, conditions: [{ condition, rejected: 1, alone: 1, leftOutOnlyByThis: ["Rain barrels — replies: 1 reply"] }] }];
    expect(automationStudioResultVerdict({ summary: { ...contradicted, reads }, diagnosis: { answersRequest: "yes" }, basis: "model" }).verdict).toBe("answers");
  });
});

// A yes is taken over a row a condition alone left out only where it quotes,
// beside that row, the request's own words that exclude it (t515, live run
// `run-mv6v2hx5-f448e662`, fix 1). Both build-test judges said yes over a
// revision whose second condition left out a row the request never excludes,
// each naming the row and calling it an accessory; and the runtime check said
// yes over the same rows.
describe("a yes over rows a condition alone left out, held to the request's own words (t515)", () => {
  const yesSaying = (observed: string, wording = requestWordsWording()) => automationStudioResultVerdict({
    summary: requestWordsRunSummary(),
    diagnosis: { answersRequest: "yes", expected: "Every garden tool on the first page that is in stock.", observed },
    basis: "model",
    wording
  });
  const stockSaid = `Copper Garden Tools Pair is left out, as the request says "leaving out out-of-stock items".`;

  it("is not taken when its reason for a row is only the words the request searched by", () => {
    const verification = yesSaying(`${stockSaid} Replacement Handle for Garden Tools is left out: it is a part, and the request asks for "garden tools".`);
    expect(verification).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.exclusion_evidence_missing" });
    expect(automationStudioResultVerificationFailsRun(verification)).toBe(false);
    expect(verification.reason).toContain("unconfirmed");
    // The repair is told the row and its condition, in Core's words, and no reading of the yes.
    expect(verification.repair?.judgement).toBeUndefined();
    expect(verification.exclusionEvidenceMissing).toEqual([
      `The check answered yes without quoting, beside this row, words of the request that exclude it; it was left out by ${REQUEST_WORDS_NAMES.handle} alone (Read read) -- ${REQUEST_WORDS_HANDLE}. A row the request's own words do not exclude is one it asks for.`
    ]);
    // Not rows Core says the request asks for: a repair's rerun is never measured against them.
    expect(automationStudioResultCheckedRowsNamed(requestWordsRunSummary(), verification.repair?.checked ?? [])).toEqual([]);
  });

  it("is taken when each row stands beside a quote of the request's own excluding words", () => {
    const wording = requestWordsWording(REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS);
    const verification = yesSaying(`${stockSaid} Replacement Handle for Garden Tools is left out, as the request says "replacement parts".`, wording);
    expect(verification).toMatchObject({ verdict: "answers", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answers });
  });

  it("is read as before where no request wording is given", () => {
    const verification = automationStudioResultVerdict({ summary: requestWordsRunSummary(), diagnosis: { answersRequest: "yes", observed: "All rows are right." }, basis: "model" });
    expect(verification.verdict).toBe("answers");
  });

  it("leaves a no as it was", () => {
    const verification = automationStudioResultVerdict({
      summary: requestWordsRunSummary(), basis: "model", wording: requestWordsWording(),
      diagnosis: { answersRequest: "no", observed: "Replacement Handle for Garden Tools is missing.", changed: "Remove the handle condition." }
    });
    expect(verification.verdict).toBe("does_not_answer");
    expect(verification.repair?.judgement?.advice).toBe("Remove the handle condition.");
  });
});
