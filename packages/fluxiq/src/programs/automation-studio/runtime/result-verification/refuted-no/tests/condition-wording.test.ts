// A no's sentence is weighed without Core's own wording of the conditions it
// names (t624, `../condition-wording.ts`): the words of a condition are Core's,
// never the judge's claim.
import { describe, expect, it } from "vitest";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading, automationStudioResultWithoutConditionWording } from "../index.ts";
import { LAMP_PLAIN, LAMPS_REQUEST_TEXT, lampsRunSummary, lampsWording } from "./lamps-fixture.ts";

const record = () => automationStudioResultNoRecord({ summary: lampsRunSummary(), requestText: LAMPS_REQUEST_TEXT, wording: lampsWording() });

describe("Core's wording of a named condition", () => {
  it("is taken out after condition N, brackets inside it included, and condition N stays", () => {
    expect(automationStudioResultWithoutConditionWording("Keep condition 2 (rating atLeast 4) and condition 3 (name not contains [\"Shade\"]).")).toBe("Keep condition 2 and condition 3.");
    expect(automationStudioResultWithoutConditionWording("Condition 1 (sponsored (read \"Ad\" on a row it kept) is absent) left out two rows.")).toBe("Condition 1 left out two rows.");
  });

  it("stays where the brackets hold the judge's own words, or never close", () => {
    expect(automationStudioResultWithoutConditionWording("Condition 2 (the rating one) is wrong.")).toBe("Condition 2 (the rating one) is wrong.");
    expect(automationStudioResultWithoutConditionWording("Condition 2 (rating atLeast 4 is wrong.")).toBe("Condition 2 (rating atLeast 4 is wrong.");
  });

  it("is no claim: a sentence that only keeps conditions neither stands nor is refuted", () => {
    expect(automationStudioResultRefutedReading({ observed: "Keep condition 1 (sponsored is absent) and condition 3 (name not contains [\"Shade\"])." }, record())).toEqual({ wholly: false, findings: [] });
  });

  it("leaves a no's own claim as it was: a stored row called missing is still refuted", () => {
    const weighed = automationStudioResultRefutedReading({ observed: `"${LAMP_PLAIN.name}" is missing from the result.` }, record());
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings[0]).toBe(`"${LAMP_PLAIN.name}" is in the stored rows.`);
  });
});
