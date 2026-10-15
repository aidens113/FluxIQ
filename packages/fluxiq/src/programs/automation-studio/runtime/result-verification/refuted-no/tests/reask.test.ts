// A no whose every reason Core's record refutes is not taken at face value,
// through the agreement that marks it (`../../agreement.ts`) and the re-ask
// (`../reask.ts`); kept beside the rule it tests, `../../tests/` being full
// (t607, A8 everything-store `run-mv8p0p7c-c8412344`, whole test 2): two calls
// on byte-identical requests both said two distinct stored listings were "the
// same pair", and the double no refuted a Flow that stored exactly the rows
// asked for. The agreement now marks such a no, the re-ask asks that call once
// more with Core's findings, and a no still refuted is unsure -- never a no,
// and never a yes Core made. A no naming a real defect, or nothing Core can
// check, stands as before.
import { describe, expect, it, vi } from "vitest";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskContradicted } from "../../agreement.ts";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultVerification } from "../../contracts/index.ts";
import type { AutomationStudioLlmDiagnosisFields } from "../../../llm/index.ts";
import { automationStudioResultVerdict } from "../../verdict.ts";
import { LAMP_CLAMP, LAMP_SHADE, LAMPS_REQUEST_TEXT, SAME_LAMP_NO, lampsRunSummary, lampsWording } from "./lamps-fixture.ts";

const summary = lampsRunSummary();
const wording = lampsWording();

const judged = (diagnosis: AutomationStudioLlmDiagnosisFields): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, wording, diagnosis, basis: "model" });

/** The same no both calls gave (whole test 2's shape). */
const sameLampNo = () => judged({ answersRequest: "no", ...SAME_LAMP_NO });
/** A yes that quotes the request for each row a condition alone left out, as `../verdict.ts` holds a yes to. */
const YES: AutomationStudioLlmDiagnosisFields = {
  answersRequest: "yes",
  expected: SAME_LAMP_NO.expected,
  observed: `Condition 1 (sponsored is absent) follows "Leave out sponsored listings". Condition 2 (rating atLeast 4) follows "rated 4 or higher". "${LAMP_SHADE}" is left out as "spare parts such as spare bulbs or lamp shades" says.`
};
/** A no that names a defect Core cannot refute. */
const REAL_DEFECT: AutomationStudioLlmDiagnosisFields = {
  answersRequest: "no",
  expected: SAME_LAMP_NO.expected,
  observed: `"${LAMP_CLAMP.name}" (LMP2B6N4C8) is a clamp lamp, not a desk lamp, and the request does not ask for it.`,
  changed: "Leave out clamp lamps."
};

const input = (first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) =>
  ({ first, second, confirmAnswer: true, reads: summary.reads, recordSets: summary.recordSets, wording, summary, requestText: LAMPS_REQUEST_TEXT });

describe("whole test 2's shape: two noes calling two distinct stored rows one", () => {
  it("are marked, each reading labelled with Core's findings, before any re-ask", () => {
    const settled = automationStudioResultVerificationAgreement(input(sameLampNo(), sameLampNo()));
    expect(settled.refutedNo).toMatchObject({ calls: [1, 2] });
    expect(settled.refutedNo?.findings[0]).toContain("as two separate rows, which differ in name and url");
    expect(settled.repair?.judgement?.observed).toMatch(/^Judge call 1 \(contradicted by Core's record: Core stored /u);
  });

  it("each call is asked once more with Core's findings, as Core's measurement and never as an instruction to answer yes; two yeses then are a yes", async () => {
    expect(judged(YES).verdict).toBe("answers");
    const ask = vi.fn(async () => judged(YES));
    const settled = automationStudioResultVerificationAgreement(input(sameLampNo(), sameLampNo()));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input(sameLampNo(), sameLampNo()), settled, ask });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls.map((call) => (call as unknown[])[1])).toEqual([1, 2]);
    const recheck = String((ask.mock.calls[0] as unknown[])[0]);
    expect(recheck).toContain("Core's record: Core stored");
    expect(recheck).toContain("names \"desk lamp\" first and \"spare bulbs\" only after it");
    expect(recheck).not.toMatch(/answer (?:yes|that it does)/iu);
    expect(outcome).toMatchObject({ verdict: "answers", calls: 4, verdicts: ["does_not_answer", "does_not_answer", "answers", "answers"], refutedNo: { calls: [1, 2], reasked: true } });
  });

  it("a re-ask that says the same no again is not taken: unsure, never a no, and the run is not failed for it", async () => {
    const settled = automationStudioResultVerificationAgreement(input(sameLampNo(), sameLampNo()));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input(sameLampNo(), sameLampNo()), settled, ask: async () => sameLampNo() });
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.refutation_contradicted", calls: 4, refutedNo: { reasked: true } });
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
    expect(outcome.reason).toContain("contradicted by Core's own record of this run");
    expect(outcome.unconfirmedReading?.observed).toMatch(/^Judge call 1 \(contradicted by Core's record: /u);
    expect(outcome).not.toHaveProperty("repair");
  });

  it("one re-ask yes beside a no still refuted is unsure, the two disagreeing; a re-ask that never came back is not taken either", async () => {
    const settled = automationStudioResultVerificationAgreement(input(sameLampNo(), sameLampNo()));
    const split = await automationStudioResultVerificationReaskContradicted({ ...input(sameLampNo(), sameLampNo()), settled, ask: async (_recheck, call) => (call === 1 ? judged(YES) : sameLampNo()) });
    expect(split).toMatchObject({ verdict: "unsure", basis: "model_disagreed", code: "core.result.refutation_contradicted" });
    const unavailable = automationStudioResultVerdict({ summary, basis: "model_unavailable", failureCode: "llm.provider_timeout" });
    const gone = await automationStudioResultVerificationReaskContradicted({ ...input(sameLampNo(), sameLampNo()), settled, ask: async () => unavailable });
    expect(gone).toMatchObject({ verdict: "unsure", code: "core.result.refutation_contradicted" });
  });

  it("a re-ask that names a defect the record leaves standing counts as a no: two such noes refute", async () => {
    const settled = automationStudioResultVerificationAgreement(input(sameLampNo(), sameLampNo()));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input(sameLampNo(), sameLampNo()), settled, ask: async () => judged(REAL_DEFECT) });
    expect(outcome).toMatchObject({ verdict: "does_not_answer", calls: 4 });
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(true);
  });
});

describe("a split's no Core's record refutes", () => {
  it("is asked once more, and a yes then beside the other yes is a yes", async () => {
    const ask = vi.fn(async () => judged(YES));
    const settled = automationStudioResultVerificationAgreement(input(judged(YES), sameLampNo()));
    expect(settled).toMatchObject({ verdict: "unsure", basis: "model_disagreed", refutedNo: { calls: [2] } });
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input(judged(YES), sameLampNo()), settled, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ verdict: "answers", calls: 3 });
  });
});

describe("a no that stands as before", () => {
  it("names a real defect: two of them refute, and nothing is asked again", async () => {
    const ask = vi.fn(async () => judged(YES));
    const settled = automationStudioResultVerificationAgreement(input(judged(REAL_DEFECT), judged(REAL_DEFECT)));
    expect(settled).not.toHaveProperty("refutedNo");
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input(judged(REAL_DEFECT), judged(REAL_DEFECT)), settled, ask });
    expect(ask).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
  });

  it("names a real defect beside a no the record refutes: the refuted one is labelled, nothing is asked again, and the verdict stays no", async () => {
    const ask = vi.fn(async () => judged(YES));
    const settled = automationStudioResultVerificationAgreement(input(sameLampNo(), judged(REAL_DEFECT)));
    expect(settled).not.toHaveProperty("refutedNo");
    expect(settled.repair?.judgement?.observed).toMatch(/^Judge call 2: .* Judge call 1 \(contradicted by Core's record: Core stored /su);
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input(sameLampNo(), judged(REAL_DEFECT)), settled, ask });
    expect(ask).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(true);
  });

  it("names nothing Core can check: two of them refute, and nothing is asked again", async () => {
    const vague: AutomationStudioLlmDiagnosisFields = { answersRequest: "no", observed: "The result does not do what the request asks.", changed: "Rebuild the read." };
    const ask = vi.fn(async () => judged(YES));
    const settled = automationStudioResultVerificationAgreement(input(judged(vague), judged(vague)));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input(judged(vague), judged(vague)), settled, ask });
    expect(ask).not.toHaveBeenCalled();
    expect(outcome.verdict).toBe("does_not_answer");
  });

  it("is never weighed without the summary: the agreement is exactly as before", () => {
    const { summary: _summary, ...without } = input(sameLampNo(), sameLampNo());
    const settled = automationStudioResultVerificationAgreement(without);
    expect(settled).toMatchObject({ verdict: "does_not_answer" });
    expect(settled).not.toHaveProperty("refutedNo");
  });
});
