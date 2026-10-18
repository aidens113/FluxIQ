// A no is only as good as what it names (t607): each sentence of its reading
// is held to Core's own record, and the reading is wholly refuted only when at
// least one claim is refuted and nothing it says stands.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmDiagnosisFields } from "../../../llm/index.ts";
import { automationStudioResultVerificationAgreement } from "../../agreement/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading } from "../index.ts";
import {
  PLANTS_FIRST_NO, PLANTS_PROMOTED_ONLY, PLANTS_REQUEST_TEXT, PLANTS_SECOND_NO, PLANTS_STORED, plantsRunSummary, plantsWording
} from "../../request-rows/tests/promoted-copies-fixture.ts";
import {
  LAMP_CLAMP, LAMP_LOW_RATED, LAMP_PLAIN, LAMP_SHADE, LAMP_SPONSORED, LAMP_WITH_BULB, LAMPS_REQUEST_TEXT, SAME_LAMP_NO, lampsRunSummary, lampsWording
} from "./lamps-fixture.ts";

const record = () => automationStudioResultNoRecord({ summary: lampsRunSummary(), requestText: LAMPS_REQUEST_TEXT, wording: lampsWording() });
const weigh = (observed: string) => automationStudioResultRefutedReading({ observed }, record());

describe("rows called one and the same", () => {
  it("are refuted where Core stored them as rows that differ, naming the columns and the answer's own dedupe", () => {
    const weighed = automationStudioResultRefutedReading(SAME_LAMP_NO, record());
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings[0]).toBe(`Core stored "${LAMP_PLAIN.name}" and "${LAMP_WITH_BULB.name}" as two separate rows, which differ in name and url; the answer's own dedupe had already removed 1 row that repeated an earlier one.`);
    // The second row's part, said after the item it names first: Core's reading of its words, not a verdict on the request.
    expect(weighed.findings[1]).toBe(`"${LAMP_WITH_BULB.name}" names "desk lamp" first and "spare bulbs" only after it.`);
  });

  it("stand where a named row's label is held by two stored rows cell for cell", () => {
    const summary = lampsRunSummary();
    summary.recordSets[0]!.sampleRows = [...summary.recordSets[0]!.sampleRows!, { ...LAMP_PLAIN }];
    const twice = automationStudioResultNoRecord({ summary, requestText: LAMPS_REQUEST_TEXT });
    const weighed = automationStudioResultRefutedReading({ observed: `"${LAMP_PLAIN.name}" (LMP4K2Q9X1) and "${LAMP_CLAMP.name}" (LMP2B6N4C8) are duplicates.` }, twice);
    expect(weighed.wholly).toBe(false);
  });

  it("stand where a row they name is one Core holds no record of", () => {
    expect(weigh(`"${LAMP_PLAIN.name}" (LMP4K2Q9X1) and "Brightline Halo Floor Lamp, Bronze" are the same product.`).wholly).toBe(false);
  });
});

describe("rows called missing", () => {
  it("are refuted where the row is stored, or a condition Core settled left it out alone", () => {
    const weighed = weigh(`The result is missing qualifying lamps: "${LAMP_SPONSORED}" and "${LAMP_LOW_RATED}" are absent from the stored rows.`);
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings[0]).toContain(`Core's read saw "${LAMP_SPONSORED}", and only condition 1 (sponsored is absent) left it out`);
    expect(weighed.findings[0]).toContain(`"${LAMP_LOW_RATED} — rating: 3.6", and only condition 2 (rating atLeast 4) left it out`);
    expect(weigh(`"${LAMP_CLAMP.name}" is missing from the result.`)).toMatchObject({ wholly: true, findings: [`"${LAMP_CLAMP.name}" is in the stored rows.`] });
  });

  it("stand where the condition that left the row out is one Core does not settle", () => {
    expect(weigh(`"${LAMP_SHADE}" was left out, though it qualifies.`).wholly).toBe(false);
  });

  it("stand where the sentence disputes the condition itself, which Core's reading of the row against it does not settle", () => {
    expect(weigh(`"${LAMP_LOW_RATED}" was left out by a rating bound stricter than the request's.`).wholly).toBe(false);
  });
});

describe("a no that names a real defect, or nothing Core can check", () => {
  it("stands where it names a row and says what is wrong with it, beside a refuted claim", () => {
    const weighed = weigh(`${SAME_LAMP_NO.observed}\n"${LAMP_CLAMP.name}" (LMP2B6N4C8) has no rating column value, which the request needs.`);
    expect(weighed.wholly).toBe(false);
    // What Core refuted is still said.
    expect(weighed.findings.length).toBeGreaterThan(0);
  });

  it("stands where it names a condition by its number and says it is wrong", () => {
    expect(weigh(`${SAME_LAMP_NO.observed}\nCondition 3 should not exist: the request does not exclude shades by name.`).wholly).toBe(false);
  });

  it("stands where it names nothing Core can check", () => {
    expect(weigh("The result does not satisfy the request.")).toEqual({ wholly: false, findings: [] });
    expect(automationStudioResultRefutedReading({ advice: SAME_LAMP_NO.observed }, record())).toEqual({ wholly: false, findings: [] });
  });

  it("stands on a count Core's record agrees with, and is refuted on one it does not", () => {
    expect(weigh("Only 3 rows were stored, but the request expects more.").wholly).toBe(false);
    expect(weigh("Only 2 rows were stored.")).toEqual({ wholly: true, findings: ["Core's record holds 3 stored rows, not 2."] });
  });
});

// Live-lane-1 fix 4 (`run-mvd8ypsv-32cde667` steps 0056 and 0057): both nos over
// an exact answer called one promoted-only row -- settled against the request's
// own exclusion words -- wrongly dropped, beside a sentence granting that four
// other left-out rows "are also in the result ..., so not missing". That
// sentence stood on its "but", "not" and "missing", so neither no was refuted
// and the run ended unverified. The run's shape on a plant nursery's catalogue.
describe("a no whose only complaint is a row Core settled against the request's exclusion words", () => {
  const plants = plantsRunSummary();
  const wording = plantsWording(plants);
  const plantsRecord = () => automationStudioResultNoRecord({ summary: plants, requestText: PLANTS_REQUEST_TEXT, wording });
  const verdict = (diagnosis: AutomationStudioLlmDiagnosisFields) => automationStudioResultVerdict({ summary: plants, diagnosis, basis: "model", wording });

  it.each([["step 0056", PLANTS_FIRST_NO], ["step 0057", PLANTS_SECOND_NO]])("%s is wholly refuted: the rows it grants came back are no reason of its own", (_step, no) => {
    expect(automationStudioResultRefutedReading(verdict(no).repair?.judgement, plantsRecord())).toEqual({
      wholly: true,
      findings: [`Core's read saw "${PLANTS_PROMOTED_ONLY}", and only condition 1 (promoted is absent) left it out: that condition tests the request's own words "promoted", and Core read "Promoted" on that row, which fails it as written.`]
    });
  });

  it("has both calls asked once more with Core's findings", () => {
    const first = verdict(PLANTS_FIRST_NO);
    const second = verdict(PLANTS_SECOND_NO);
    expect([first.verdict, second.verdict]).toEqual(["does_not_answer", "does_not_answer"]);
    const settled = automationStudioResultVerificationAgreement({ first, second, reads: plants.reads, recordSets: plants.recordSets, wording, summary: plants, requestText: PLANTS_REQUEST_TEXT });
    expect(settled.refutedNo?.calls).toEqual([1, 2]);
  });

  // A sentence granting rows came back, beside the refuted one: only a grant and nothing else is set aside.
  const beside = (sentence: string) => automationStudioResultRefutedReading({ observed: `${sentence} ${PLANTS_PROMOTED_ONLY} is left out only by condition 1 and is absent from the stored rows.` }, plantsRecord()).wholly;
  const COPIES = "4 of them (Kentia Palm Classic 14 in Pot, Peace Lily 8 in Pot, Snake Plant Laurentii, 10 in Pot, Parlor Palm Bella, 6 in Pot)";

  it("is refuted beside any wording of the grant alone", () => {
    expect(beside(`Condition 1 left out 5 rows, but ${COPIES} are also in the result, so not missing.`)).toBe(true);
    expect(beside("Kentia Palm Classic, 14 in Pot is also among the stored rows.")).toBe(true);
  });

  it("stands where the sentence granting rows came back also says something is wrong", () => {
    expect(beside(`Condition 1 left out 5 rows, but ${COPIES} are also in the result, and the fifth is wrongly dropped.`)).toBe(false);
    expect(beside("Kentia Palm Classic, 14 in Pot is also in the result but is not a houseplant.")).toBe(false);
  });

  it("stands where a row the grant names is one no condition left a copy of, or it says nothing of the rows being in the result", () => {
    expect(beside(`Condition 1 left out 5 rows, but ${PLANTS_STORED[1]!.name as string} is also in the result.`)).toBe(false);
    expect(beside(`Condition 1 left out 5 rows, but ${COPIES} look like houseplants.`)).toBe(false);
  });
});
