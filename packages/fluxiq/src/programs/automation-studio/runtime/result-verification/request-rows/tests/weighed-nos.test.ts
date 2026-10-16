// A double no carries what Core's record says of each call's no as a field,
// `weighedNos`, for the playback hold to read (t664, `../../build-yes-hold/`),
// never from the labels in the merged reading's text. Kept here beside the
// other agreement checks, `../../tests/` and `../../refuted-no/tests/` being
// full.
import { describe, expect, it } from "vitest";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskContradicted } from "../../agreement.ts";
import type { AutomationStudioResultVerification } from "../../contracts/index.ts";
import type { AutomationStudioLlmDiagnosisFields } from "../../../llm/index.ts";
import { campsiteRequestText, campsiteRunSummary, campsiteWording } from "../../refuted-no/tests/campsite-fixture.ts";
import { GAP_AND_CHANGE_NO, GAP_NO } from "../../refuted-no/tests/campsite-readings-fixture.ts";
import { LAMP_CLAMP, LAMPS_REQUEST_TEXT, SAME_LAMP_NO, lampsRunSummary, lampsWording } from "../../refuted-no/tests/lamps-fixture.ts";
import { automationStudioResultVerdict } from "../../verdict.ts";

const campsite = campsiteRunSummary();
const campsiteWords = campsiteWording(campsite);
const campsiteNo = (reading: Record<string, string>): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary: campsite, wording: campsiteWords, diagnosis: { answersRequest: "no", ...reading }, basis: "model" });
const campsiteInput = (first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) =>
  ({ first, second, confirmAnswer: true, reads: campsite.reads, recordSets: campsite.recordSets, wording: campsiteWords, summary: campsite, requestText: campsiteRequestText() });

const lamps = lampsRunSummary();
const lampsWords = lampsWording();
const lampsJudged = (diagnosis: AutomationStudioLlmDiagnosisFields): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary: lamps, wording: lampsWords, diagnosis, basis: "model" });
const lampsInput = (first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) =>
  ({ first, second, confirmAnswer: true, reads: lamps.reads, recordSets: lamps.recordSets, wording: lampsWords, summary: lamps, requestText: LAMPS_REQUEST_TEXT });
const sameLampNo = () => lampsJudged({ answersRequest: "no", ...SAME_LAMP_NO });
/** A no naming a defect Core cannot refute. */
const clampNo = () => lampsJudged({
  answersRequest: "no", expected: SAME_LAMP_NO.expected,
  observed: `"${LAMP_CLAMP.name}" (LMP2B6N4C8) is a clamp lamp, not a desk lamp, and the request does not ask for it.`, changed: "Leave out clamp lamps."
});

describe("a double no's weighedNos", () => {
  it("gives both calls `part` where Core's record contradicts part of each no", () => {
    const outcome = automationStudioResultVerificationAgreement(campsiteInput(campsiteNo(GAP_AND_CHANGE_NO), campsiteNo(GAP_AND_CHANGE_NO)));
    expect(outcome.verdict).toBe("does_not_answer");
    expect(outcome.weighedNos).toEqual([{ call: 1, recordContradicts: "part" }, { call: 2, recordContradicts: "part" }]);
  });

  it("gives a no that stands whole an entry with nothing contradicted, beside one contradicted in part", () => {
    expect(automationStudioResultVerificationAgreement(campsiteInput(campsiteNo(GAP_NO), campsiteNo(GAP_NO))).weighedNos).toEqual([{ call: 1 }, { call: 2 }]);
    expect(automationStudioResultVerificationAgreement(campsiteInput(campsiteNo(GAP_AND_CHANGE_NO), campsiteNo(GAP_NO))).weighedNos).toEqual([{ call: 1, recordContradicts: "part" }, { call: 2 }]);
  });

  it("gives `whole` where the record refutes each no, and is absent without Core's record", () => {
    expect(automationStudioResultVerificationAgreement(lampsInput(sameLampNo(), sameLampNo())).weighedNos).toEqual([{ call: 1, recordContradicts: "whole" }, { call: 2, recordContradicts: "whole" }]);
    expect(automationStudioResultVerificationAgreement({ first: sameLampNo(), second: sameLampNo(), confirmAnswer: true })).not.toHaveProperty("weighedNos");
  });

  it("describes the re-asked calls after the t607 re-ask, not the first ones", async () => {
    const input = lampsInput(sameLampNo(), sameLampNo());
    const settled = automationStudioResultVerificationAgreement(input);
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask: async () => clampNo() });
    expect(outcome).toMatchObject({ verdict: "does_not_answer", refutedNo: { reasked: true } });
    expect(outcome.weighedNos).toEqual([{ call: 1 }, { call: 2 }]);
  });
});
