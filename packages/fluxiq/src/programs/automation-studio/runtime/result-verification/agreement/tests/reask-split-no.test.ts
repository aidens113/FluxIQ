// A split's no is asked once more to name the defect it found (t725, social
// r4 `run-mvfq957o-40103539`, 0084): a no that names none beside a yes is
// asked again; a yes there makes two yeses and its concern travels as advice;
// a no naming a real defect stands; readings that agree are untouched; nothing
// is asked twice. The made-up recipe archive of `./recipe-split-fixture.ts`.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioResultVerification } from "../../contracts/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK, automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskSplitNo } from "../index.ts";
import { RECIPE_DEFECT_NO, RECIPE_HYPOTHETICAL_NO, RECIPE_YES, recipeRunSummary } from "./recipe-split-fixture.ts";

const judged = (diagnosis: Record<string, string>): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary: recipeRunSummary(), basis: "model", diagnosis: { ...diagnosis, answersRequest: diagnosis.answersRequest === "yes" ? "yes" : "no" } });
const YES = judged(RECIPE_YES);
const HYPOTHETICAL_NO = judged(RECIPE_HYPOTHETICAL_NO);
const DEFECT_NO = judged(RECIPE_DEFECT_NO);

async function reasked(first: AutomationStudioResultVerification, second: AutomationStudioResultVerification, answer: AutomationStudioResultVerification, settledOverride?: AutomationStudioResultVerification) {
  const input = { first, second, confirmAnswer: true };
  const settled = settledOverride ?? automationStudioResultVerificationAgreement(input);
  const ask = vi.fn(async (_recheck: string, _call: 1 | 2) => answer);
  const agree = (one: AutomationStudioResultVerification, two: AutomationStudioResultVerification) => automationStudioResultVerificationAgreement({ ...input, first: one, second: two });
  const outcome = await automationStudioResultVerificationReaskSplitNo({ settled, first, second, ask, agree });
  return { settled, ask, outcome };
}

describe("a split's no asked to name its defect (t725)", () => {
  it("is asked once, as the call that said no, with words asking for a named row, column or value and the request's words quoted", async () => {
    const { settled, ask } = await reasked(HYPOTHETICAL_NO, YES, YES);
    expect(settled).toMatchObject({ verdict: "unsure", basis: "model_disagreed", calls: 2 });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK, 1);
    expect(AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK).toContain("quote the words of the request");
    expect(AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK).toMatch(/a row it keeps that the request does not ask for, a row the request asks for that it left out, or a column or value that is wrong/u);
    expect(AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK).not.toMatch(/\b(?:soup|recipe|archive|members|group|feed|post)\w*/iu);
  });

  it("becomes a yes where the re-asked call names no defect, the no's concern carried as advice", async () => {
    const { outcome } = await reasked(HYPOTHETICAL_NO, YES, YES);
    expect(outcome).toMatchObject({ verdict: "answers", basis: "model", calls: 3, verdicts: ["does_not_answer", "answers", "answers"] });
    expect(outcome.answeredReading?.advice).toBe(RECIPE_HYPOTHETICAL_NO.changed);
    expect(outcome.repair).toBeUndefined();
    expect(outcome.unconfirmedReading).toBeUndefined();
  });

  it("asks call 2 where the yes came first", async () => {
    const { ask, outcome } = await reasked(YES, HYPOTHETICAL_NO, YES);
    expect(ask).toHaveBeenCalledWith(AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK, 2);
    expect(outcome).toMatchObject({ verdict: "answers", calls: 3, verdicts: ["answers", "does_not_answer", "answers"] });
  });

  it("stays disagreed where the re-asked call names a real defect, carrying that reading", async () => {
    const { ask, outcome } = await reasked(HYPOTHETICAL_NO, YES, DEFECT_NO);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_disagreed", calls: 3, verdicts: ["does_not_answer", "answers", "does_not_answer"] });
    expect(outcome.unconfirmedReading?.observed).toBe(RECIPE_DEFECT_NO.observed);
    expect(outcome.answeredReading?.advice).toBeUndefined();
  });

  it("keeps the split as it was where the re-ask did not come back usable", async () => {
    const unavailable = automationStudioResultVerdict({ summary: recipeRunSummary(), basis: "model_unavailable", failureCode: "llm.provider_timeout" });
    const { settled, outcome } = await reasked(HYPOTHETICAL_NO, YES, unavailable);
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_disagreed", calls: 3, verdicts: ["does_not_answer", "answers", "unsure"] });
    expect(outcome.unconfirmedReading).toEqual(settled.unconfirmedReading);
  });

  it("leaves readings that agree unchanged, and asks nothing", async () => {
    for (const [first, second] of [[YES, YES], [HYPOTHETICAL_NO, DEFECT_NO]] as const) {
      const { settled, ask, outcome } = await reasked(first, second, YES);
      expect(ask).not.toHaveBeenCalled();
      expect(outcome).toEqual(settled);
    }
  });

  it("is never asked twice: an outcome some call was already asked again for is returned as it was", async () => {
    const settled: AutomationStudioResultVerification = { ...automationStudioResultVerificationAgreement({ first: HYPOTHETICAL_NO, second: YES, confirmAnswer: true }), verdicts: ["does_not_answer", "answers", "does_not_answer"], calls: 3 };
    const { ask, outcome } = await reasked(HYPOTHETICAL_NO, YES, YES, settled);
    expect(ask).not.toHaveBeenCalled();
    expect(outcome).toBe(settled);
  });

  it("does not ask a no that is a yes Core refused, which carries no reading of its own", async () => {
    const { judgement: _judgement, ...readingless } = DEFECT_NO.repair!;
    const refused: AutomationStudioResultVerification = { ...DEFECT_NO, repair: readingless };
    const { ask } = await reasked(refused, YES, YES);
    expect(ask).not.toHaveBeenCalled();
  });
});
