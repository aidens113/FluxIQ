// A replay of A8 `run-mvbr0w7e-6a01c05b`'s judged trial (steps 0032 and 0033,
// byte-identical yeses) through the verdict, paraphrased to a library's loans
// (t691): the answer held four rows the Flow did not act on, stored by a last
// read with no condition, and the yes never said why. Core told the judge the
// four were another copy of a kept item and exempted them from every quote, so
// the yes was taken. It is no longer taken: it is held for the four rows, and
// the judge's copy no longer vouches for them.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultReadCondition } from "../../read-condition.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultSummaryWithAlsoInResult } from "../summary-with-also-in-result.ts";
import type { AutomationStudioRequestRowsStoredMark } from "../types.ts";
import { RENEWALS_LEFT_OUT, RENEWALS_REQUEST_EVERY_LOAN, RENEWALS_YES, RENEWALS_YES_EXPLAINED, renewalsRunSummary, renewalsWording } from "./renewals-fixture.ts";

describe("judge 0032's yes, replayed on a library's loans", () => {
  it("is not taken: it is held for the rows another read stored", () => {
    const verdict = automationStudioResultVerdict({ summary: renewalsRunSummary(), diagnosis: RENEWALS_YES.diagnosis, summaryText: RENEWALS_YES.summaryText, basis: "model", wording: renewalsWording() });
    expect(verdict.verdict).not.toBe("answers");
    expect(verdict).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.exclusion_evidence_missing", yesUnconfirmed: true });
    const lines = verdict.exclusionEvidenceMissing ?? [];
    for (const [title] of RENEWALS_LEFT_OUT) expect(lines.join("\n")).toContain(title);
  });

  it("was shown none of the four as another copy of a kept item", () => {
    const judged = automationStudioResultSummaryWithAlsoInResult(renewalsRunSummary());
    const condition = judged.reads![0]!.conditions![0]! as AutomationStudioResultReadCondition & AutomationStudioRequestRowsStoredMark;
    expect(condition.leftOutAlsoInResult).toBeUndefined();
    expect(condition.storedThoughLeftOut).toHaveLength(RENEWALS_LEFT_OUT.length);
  });

  it("is taken, where the request asks for every loan, when it names each row beside the read that stored it and quotes those words", () => {
    const verdict = automationStudioResultVerdict({ summary: renewalsRunSummary(), diagnosis: { ...RENEWALS_YES.diagnosis, observed: RENEWALS_YES_EXPLAINED }, basis: "model", wording: renewalsWording(RENEWALS_REQUEST_EVERY_LOAN) });
    expect(verdict.verdict).toBe("answers");
  });
});
