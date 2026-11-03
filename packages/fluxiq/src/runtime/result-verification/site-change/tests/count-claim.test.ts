// A no calling a place's total after a trial the wrong count, where the place
// changed by exactly what its part asks (t775, `../count-claim.ts`), is
// refuted with Core's change line and asked once more, as any no Core's record
// wholly refutes (`../../refuted-no/`). The holds list held 3 before the
// trial and 4 after it: 1 hold was placed, which is what part p1 asks.
import { describe, expect, it, vi } from "vitest";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskContradicted } from "../../agreement/index.ts";
import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import type { AutomationStudioLlmDiagnosisFields } from "../../../llm/index.ts";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading } from "../../refuted-no/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultChangeCountClaim } from "../index.ts";
import { LIBRARY_HOLDS_REQUEST, libraryHoldsChange, libraryHoldsSummary } from "./library-holds-fixture.ts";

const WRONG_COUNT: AutomationStudioLlmDiagnosisFields = {
  answersRequest: "no",
  expected: "One hold placed on The Quiet Shore.",
  observed: "The holds list now shows 4 holds, but the request asked to place only 1 hold.",
  changed: "Place exactly one hold."
};

const judged = (summary: AutomationStudioRunResultSummary, diagnosis: AutomationStudioLlmDiagnosisFields): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis, basis: "model" });
const input = (summary: AutomationStudioRunResultSummary, first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) =>
  ({ first, second, confirmAnswer: true, summary, requestText: LIBRARY_HOLDS_REQUEST });

describe("a no claiming the wrong count where the trial's change is what its part asks", () => {
  it("is refuted with Core's change line", () => {
    const claim = automationStudioResultChangeCountClaim(WRONG_COUNT.observed!, libraryHoldsChange());
    expect(claim?.refuted).toBe(true);
    expect(claim?.finding).toContain('"My holds": 1 row added, none removed or changed');
    expect(claim?.finding).toContain("which is the change it asks for (adds 1 hold on a book)");
    const record = automationStudioResultNoRecord({ summary: libraryHoldsSummary(), requestText: LIBRARY_HOLDS_REQUEST });
    const weighed = automationStudioResultRefutedReading({ observed: WRONG_COUNT.observed!, advice: WRONG_COUNT.changed! }, record);
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings).toEqual([claim!.finding]);
  });

  it("is marked by the agreement and asked once more with that line; two yeses then are a yes", async () => {
    const summary = libraryHoldsSummary();
    const settled = automationStudioResultVerificationAgreement(input(summary, judged(summary, WRONG_COUNT), judged(summary, WRONG_COUNT)));
    expect(settled.refutedNo).toMatchObject({ calls: [1, 2] });
    const ask = vi.fn(async () => judged(summary, { answersRequest: "yes", observed: "The holds list went from 3 to 4: one hold placed; the alert was set." }));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input(summary, judged(summary, WRONG_COUNT), judged(summary, WRONG_COUNT)), settled, ask });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(String((ask.mock.calls[0] as unknown[])[0])).toContain("1 row added, none removed or changed");
    expect(outcome).toMatchObject({ verdict: "answers", refutedNo: { reasked: true } });
  });

  it("stands where the change is not what the part asks, or the sentence also says something else", () => {
    expect(automationStudioResultChangeCountClaim(WRONG_COUNT.observed!, libraryHoldsChange("carried", { added: 3 }))).toBeUndefined();
    // A changed row whose lines do not pair as one whole number moved: no reading, so never matched (`./quantity-moves.test.ts`).
    expect(automationStudioResultChangeCountClaim(WRONG_COUNT.observed!, libraryHoldsChange("carried", { added: 0, changed: 1 }))).toBeUndefined();
    expect(automationStudioResultChangeCountClaim("The holds list now shows 4 holds, but the reading-room alert was never set to email.", libraryHoldsChange())).toBeUndefined();
    expect(automationStudioResultChangeCountClaim("Step 3 placed 1 hold on a book.", libraryHoldsChange())).toBeUndefined();
    expect(automationStudioResultChangeCountClaim(WRONG_COUNT.observed!, undefined)).toBeUndefined();
    const record = automationStudioResultNoRecord({ summary: libraryHoldsSummary(libraryHoldsChange("carried", { added: 3 })), requestText: LIBRARY_HOLDS_REQUEST });
    expect(automationStudioResultRefutedReading({ observed: WRONG_COUNT.observed! }, record).wholly).toBe(false);
  });
});
