// A no is weighed first by what it references (t631): the conditions its
// advice changes, held to Core's read account of each, and the rows a sentence
// names, whatever its words. The wording claims of t607 and t629 stay the
// fallback for what references alone do not settle.
import { describe, expect, it } from "vitest";
import {
  automationStudioResultAdviceConditions,
  automationStudioResultConditionReferences,
  automationStudioResultMissingClaim,
  automationStudioResultNoRecord,
  automationStudioResultRefutedReading,
  automationStudioResultSentenceRows
} from "../index.ts";
import {
  CAMP_CEDAR, CAMP_LARCH, CAMP_OSPREY, CAMP_READ, CAMP_SILVER, CAMP_WILLOW, CAMPSITE_REQUEST, OPEN_THIS_WEEKEND,
  campsiteRequestText, campsiteRunSummary, campsiteWording
} from "./campsite-fixture.ts";
import {
  ADVICE_ADDS_NO, DROP_NAME_CONDITIONS_NO, DROPPED_NOT_EXCLUDED_NO, LEFT_OUT_CALLED_STORED_NO, RELAX_ONE_CONDITION_NO, STORED_CALLED_WRONG_NO, WRONGLY_LEFT_OUT_NO
} from "./campsite-readings-fixture.ts";

type Options = Parameters<typeof campsiteRunSummary>[0];
const record = (options: Options = {}, body = CAMPSITE_REQUEST) => {
  const summary = campsiteRunSummary(options);
  return automationStudioResultNoRecord({ summary, requestText: campsiteRequestText(body), wording: campsiteWording(summary, body) });
};
const reading = (no: { expected: string; observed: string; changed: string }) => ({ expected: no.expected, observed: no.observed, advice: no.changed });
/** The request offering another value beside the availability condition's words: that condition no longer only restates it. */
const EITHER = CAMPSITE_REQUEST.replace("open this weekend", "open this weekend or next");

describe("the conditions a sentence names by number", () => {
  it("are read from Core's naming and the lists a judge writes, each condition's wording taken out first", () => {
    expect(automationStudioResultConditionReferences("Remove or relax condition 4 on the read.")).toEqual([4]);
    expect(automationStudioResultConditionReferences(`Conditions 4 (name contains ["Campground"]), 5 (name not contains ["Cabin"]) and 6 (name not contains ["Group"]) are extra.`)).toEqual([4, 5, 6]);
    expect(automationStudioResultConditionReferences("Remove the name-based conditions (4, 5, 6) and conditions 7-9.")).toEqual([4, 5, 6, 7, 8, 9]);
    expect(automationStudioResultConditionReferences("Conditions 5/6 are extra.")).toEqual([5, 6]);
    // A singular names one number: "3 rows by condition 4, 2 by condition 5" names no condition 2.
    expect(automationStudioResultConditionReferences("The read rejected 3 rows by condition 4, 2 by condition 5, 1 by condition 6.")).toEqual([4, 5, 6]);
    expect(automationStudioResultConditionReferences("The where conditions keep too little.")).toEqual([]);
  });
});

describe("Core's record of every condition", () => {
  it("holds those that left out no row alone, and accounts for each row the others left out", () => {
    const conditions = record().conditions!;
    expect(conditions.map((condition) => [condition.number, condition.nodeId])).toEqual([[1, CAMP_READ], [2, CAMP_READ], [3, CAMP_READ], [4, CAMP_READ], [5, CAMP_READ]]);
    // Condition 1's rows are copies of stored rows; condition 2's failed the request's own words; condition 3's only a bound Core does not hold to the request.
    expect(conditions[0]!.leftOut!.every((row) => row.accounted?.by === "also_in_result")).toBe(true);
    expect(conditions[1]!.leftOut!.map((row) => row.accounted)).toEqual([0, 1, 2].map(() => ({ by: "request_words", texts: ["Open this weekend"] })));
    expect(conditions[2]!.leftOut!.map((row) => row.accounted)).toEqual([undefined]);
    expect(conditions[3]).toMatchObject({ rejected: 2, leftOut: [] });
    expect(conditions[4]).toMatchObject({ rejected: 0, leftOut: [] });
  });
});

describe("a no whose advice changes, removes or loosens only conditions Core names", () => {
  it("is refuted where each left out no row by itself and the counts show none left out by them together, whatever its reasons' wording (steps 0053, 0086)", () => {
    const weighed = automationStudioResultRefutedReading(reading(DROP_NAME_CONDITIONS_NO), record());
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings).toEqual([
      `Condition 4 (name contains ["Campground"]) left out no row by itself: each of the 2 rows it rejected, another condition rejected too. Removing or loosening it alone brings back no row.`,
      `Condition 5 (name not contains ["Cabin"]) left out no row by itself. Removing or loosening it alone brings back no row.`
    ]);
  });

  it("stands where two of the conditions it changes rejected rows another condition rejected too: a row only they left out together may be one the request asks for, and no account says which", () => {
    // The fixture's `together` run: the two name conditions left out, together, a campsite the request asks for, which Core cannot see.
    expect(automationStudioResultAdviceConditions(DROP_NAME_CONDITIONS_NO.changed, record({ together: true }))).toBeUndefined();
    expect(automationStudioResultRefutedReading(reading(DROP_NAME_CONDITIONS_NO), record({ together: true }))).toEqual({ wholly: false, findings: [] });
    // Changing one of them alone brings back no such row: that advice is still weighed by its condition.
    expect(automationStudioResultRefutedReading(reading(RELAX_ONE_CONDITION_NO), record({ together: true })).wholly).toBe(true);
  });

  it("stands where a condition it changes, beside another, has no count of the rows it rejected: the account cannot say which left a row out", () => {
    const uncounted = campsiteRunSummary();
    delete uncounted.reads![0]!.conditions![4]!.rejected;
    const counted = automationStudioResultNoRecord({ summary: uncounted, requestText: campsiteRequestText(), wording: campsiteWording(uncounted) });
    expect(automationStudioResultAdviceConditions(DROP_NAME_CONDITIONS_NO.changed, counted)).toBeUndefined();
    expect(automationStudioResultAdviceConditions(RELAX_ONE_CONDITION_NO.changed, counted)).toBeDefined();
  });

  it("is refuted in step 0085's shape: one sentence keeping three conditions and calling a fourth extra", () => {
    expect(automationStudioResultRefutedReading(reading(RELAX_ONE_CONDITION_NO), record()).wholly).toBe(true);
  });

  it("is refuted where every row the condition alone left out failed the request's own words by the value Core read", () => {
    const advised = automationStudioResultAdviceConditions(DROPPED_NOT_EXCLUDED_NO.changed, record());
    expect(advised?.findings).toEqual([`Of the 3 rows condition 2 (${OPEN_THIS_WEEKEND}) left out by itself, 3 show a value Core read that fails the request's own words "Open this weekend". Removing or loosening it alone brings back no row the request asks for.`]);
  });

  it("stands where a condition it changes left out a row Core does not account for, or whose rows the read did not send", () => {
    expect(automationStudioResultAdviceConditions(WRONGLY_LEFT_OUT_NO.changed, record({ nameDrops: true }))).toBeUndefined();
    expect(automationStudioResultAdviceConditions(`Relax condition 3 on ${CAMP_READ}.`, record())).toBeUndefined();
    expect(automationStudioResultAdviceConditions(DROPPED_NOT_EXCLUDED_NO.changed, record({}, EITHER))).toBeUndefined();
    const unsent = campsiteRunSummary();
    delete unsent.reads![0]!.conditions![3]!.alone;
    expect(automationStudioResultAdviceConditions(RELAX_ONE_CONDITION_NO.changed, automationStudioResultNoRecord({ summary: unsent, requestText: campsiteRequestText(), wording: campsiteWording(unsent) }))).toBeUndefined();
  });

  it("stands where the advice also adds, names another step to change, names a row, or keeps nothing it names", () => {
    expect(automationStudioResultRefutedReading(reading(ADVICE_ADDS_NO), record()).wholly).toBe(false);
    expect(automationStudioResultAdviceConditions("Remove condition 4 from the read and dedupe by url.", record())).toBeUndefined();
    expect(automationStudioResultAdviceConditions(`Remove condition 4 on ${CAMP_READ} and move node.trial.7c41e9a2.find_sites.s4 after the search.`, record())).toBeUndefined();
    expect(automationStudioResultAdviceConditions(`Relax condition 4 so ${CAMP_CEDAR.name} stays.`, record())).toBeUndefined();
    expect(automationStudioResultAdviceConditions("Keep condition 4 but remove condition 5.", record())).toBeUndefined();
    expect(automationStudioResultAdviceConditions("Also check the second page.", record())).toBeUndefined();
  });

  it("stands where its reasons name a row or a step Core does not clear beside the conditions", () => {
    const advice = `Remove condition 4 from ${CAMP_READ}.`;
    expect(automationStudioResultRefutedReading({ observed: `Condition 4 is extra narrowing. ${STORED_CALLED_WRONG_NO.observed}`, advice }, record()).wholly).toBe(false);
    expect(automationStudioResultRefutedReading({ observed: "Condition 4 is extra narrowing, and node.trial.7c41e9a2.find_sites.s4 narrows the list, which is wrong.", advice }, record()).wholly).toBe(false);
  });
});

describe("a sentence naming rows, whatever its wording", () => {
  it("is refuted in step 0109's words, which no wording pattern reads as rows called missing", () => {
    const sentence = DROPPED_NOT_EXCLUDED_NO.observed.split(". ")[1]!;
    const named = automationStudioResultSentenceRows(sentence.replace(`(${OPEN_THIS_WEEKEND})`, ""), record());
    // The values quoted are ones Core read, not rows it has no record of.
    expect(named).toMatchObject({ unmatched: false, stored: [] });
    expect(named.leftOut.map((row) => row.label)).toEqual([CAMP_LARCH, CAMP_OSPREY, CAMP_WILLOW]);
    expect(automationStudioResultMissingClaim(sentence, named)).toBeUndefined();
    // Without its advice, the rows alone refute it.
    const weighed = automationStudioResultRefutedReading({ observed: DROPPED_NOT_EXCLUDED_NO.observed }, record());
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings[0]).toContain(`Core's read saw "${CAMP_LARCH}", and only condition 2 (${OPEN_THIS_WEEKEND}) left it out: that condition tests the request's own words "Open this weekend", and Core read "Open next weekend" on that row, which fails it as written.`);
    expect(automationStudioResultRefutedReading(reading(DROPPED_NOT_EXCLUDED_NO), record()).wholly).toBe(true);
  });

  it("stands where the condition does not only restate the request: whether the request asks for those rows is the judge's", () => {
    expect(automationStudioResultRefutedReading(reading(DROPPED_NOT_EXCLUDED_NO), record({}, EITHER)).wholly).toBe(false);
  });

  it("stands where it names a row the read left out that Core did not settle: a real defect", () => {
    expect(automationStudioResultRefutedReading(reading(WRONGLY_LEFT_OUT_NO), record({ nameDrops: true })).wholly).toBe(false);
    expect(automationStudioResultRefutedReading({ observed: `${DROPPED_NOT_EXCLUDED_NO.observed} It also dropped ${CAMP_SILVER}.` }, record({ nameDrops: true })).wholly).toBe(false);
  });

  it("calling a row the read left out stored is refuted; calling a stored row the wrong kind stands", () => {
    expect(automationStudioResultRefutedReading(reading(LEFT_OUT_CALLED_STORED_NO), record())).toEqual({
      wholly: true,
      findings: [`"${CAMP_OSPREY}" is not in the stored rows: only condition 2 (${OPEN_THIS_WEEKEND}) left it out.`]
    });
    expect(automationStudioResultRefutedReading(reading(STORED_CALLED_WRONG_NO), record()).wholly).toBe(false);
  });
});
