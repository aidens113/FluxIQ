// What an earlier judged trial of the same build advised, and whether the
// revision now asked about changed what that advice named (t752,
// `../earlier-advice.ts`), on a library's catalogue search: no task, site,
// item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import { automationStudioResultEarlierAdvice, type AutomationStudioResultConditionPlan, type AutomationStudioResultStandingNoRecord } from "../index.ts";

/** The read as revision 2's Flow named it, and as revision 3's: the same step under another hash. */
const READ_2 = "node.bootstrap.aa11bb22.find_books.s3";
const OPEN_2 = "node.bootstrap.aa11bb22.find_books.s1";
const ON_SHELF = { field: "status", contains: "On shelf" };
const ON_SHELF_OR_HOLD = { field: "status", contains: ["On shelf", "On hold"] };
const PAGES = { field: "pages", atMost: 300 };
const NOT_FEATURED = { field: "featured", is: "absent" };

function plan(where: readonly object[], url = "https://catalogue.test"): AutomationStudioResultConditionPlan {
  return { subflows: [{ key: "find_books", nodes: [
    { key: "s1", parameters: { url } },
    { key: "s3", parameters: { extract: { where, fields: { title: "title" } } } }
  ] }] };
}

/** Core's record of revision 2's no: its read's conditions, by revision 2's node id. */
function record(): AutomationStudioResultStandingNoRecord {
  return {
    stored: ["A Field Guide to Ferns"], storedWhole: true, standing: [{ call: 1 }, { call: 2 }],
    conditions: [
      { name: "condition 1 (status contains [\"On shelf\"])", nodeId: READ_2, number: 1 },
      { name: "condition 2 (pages atMost 300)", nodeId: READ_2, number: 2 }
    ]
  };
}

const PLAN_2 = plan([ON_SHELF, PAGES]);
const ADVICE = `Condition 1 of ${READ_2} keeps only books on the shelf; also accept books on hold.`;
const trial = (over: Partial<{ revision: number; verdict: "no" | "unsure"; advice: string; standingNo: unknown; plan: AutomationStudioResultConditionPlan }> = {}) =>
  ({ revision: 2, verdict: "no" as const, advice: ADVICE, standingNo: record(), plan: PLAN_2, ...over });

describe("an earlier judged trial's advice, as a later trial's judge is told it (t752)", () => {
  it("says the revision changed the condition the advice named, matched across the revisions' hashes", () => {
    const [told, ...rest] = automationStudioResultEarlierAdvice({ trials: [trial()], revision: 3, plan: plan([ON_SHELF_OR_HOLD, PAGES]) });
    expect(rest).toEqual([]);
    expect(told).toEqual({
      revision: 2, verdict: "no", advice: ADVICE, followed: "changed",
      named: ["condition 1 (status contains [\"On shelf\"]) of step find_books.s3"],
      said: `After the trial of revision 2 (judged no) the judge advised: ${ADVICE} Revision 3 changed condition 1 (status contains ["On shelf"]) of step find_books.s3, which that advice named.`
    });
  });

  it("says the revision left the named condition as it was, wherever its list now numbers it", () => {
    const advice = `Remove condition 2 of ${READ_2}.`;
    const [kept] = automationStudioResultEarlierAdvice({ trials: [trial({ advice })], revision: 3, plan: plan([ON_SHELF, PAGES]) });
    expect(kept).toMatchObject({ followed: "unchanged", named: ["condition 2 (pages atMost 300) of step find_books.s3"] });
    expect(kept!.said).toContain("Revision 3 left condition 2 (pages atMost 300) of step find_books.s3 as revision 2 wrote it, though that advice named it.");
    // A condition before it dropped renumbers it, and it is still written as it was.
    const [renumbered] = automationStudioResultEarlierAdvice({ trials: [trial({ advice })], revision: 3, plan: plan([PAGES]) });
    expect(renumbered).toMatchObject({ followed: "unchanged" });
  });

  it("resolves a condition named by number alone through Core's record, and a step named without a condition by its parameters", () => {
    const [byNumber] = automationStudioResultEarlierAdvice({ trials: [trial({ advice: "Loosen condition 1 so books on hold are kept." })], revision: 3, plan: plan([ON_SHELF_OR_HOLD, PAGES]) });
    expect(byNumber).toMatchObject({ followed: "changed", named: ["condition 1 (status contains [\"On shelf\"]) of step find_books.s3"] });
    const step = automationStudioResultEarlierAdvice({ trials: [trial({ advice: `Open the full catalogue at ${OPEN_2} first.`, standingNo: undefined })], revision: 3, plan: plan([ON_SHELF, PAGES], "https://catalogue.test/all") });
    expect(step[0]).toMatchObject({ followed: "changed", named: ["step find_books.s1"] });
    const same = automationStudioResultEarlierAdvice({ trials: [trial({ advice: `Open the full catalogue at ${OPEN_2} first.`, standingNo: undefined })], revision: 3, plan: PLAN_2 });
    expect(same[0]).toMatchObject({ followed: "unchanged", named: ["step find_books.s1"] });
  });

  it("says unknown where Core cannot resolve what the advice names", () => {
    const [vague] = automationStudioResultEarlierAdvice({ trials: [trial({ advice: "Read every page of results before saving." })], revision: 3, plan: plan([NOT_FEATURED]) });
    expect(vague).toMatchObject({ followed: "unknown" });
    expect(vague).not.toHaveProperty("named");
    expect(vague!.said).toBe("After the trial of revision 2 (judged no) the judge advised: Read every page of results before saving. "
      + "Core could not tell which conditions or steps that advice names, so whether revision 3 followed it is not known.");
    // Condition 1 of two reads, and no step named: not one condition, so unknown.
    const two = { ...record(), conditions: [...record().conditions, { name: "condition 1 (title contains [\"Ferns\"])", nodeId: "node.bootstrap.aa11bb22.find_books.s5", number: 1 }] };
    expect(automationStudioResultEarlierAdvice({ trials: [trial({ advice: "Loosen condition 1.", standingNo: two })], revision: 3, plan: PLAN_2 })[0]).toMatchObject({ followed: "unknown" });
  });

  it("hands all completed trials judged no, oldest first, retaining advice beyond three trials and same-revision retests", () => {
    const trials = [1, 2, 3, 5].map((revision) => trial({ revision }));
    const told = automationStudioResultEarlierAdvice({ trials, revision: 5, plan: PLAN_2 });
    expect(told.map((one) => one.revision)).toEqual([1, 2, 3, 5]);
    expect(automationStudioResultEarlierAdvice({ trials: [trial()], revision: 2, plan: PLAN_2 })).toMatchObject([{ revision: 2, followed: "unchanged" }]);
  });

  // Rerun round 6 social `run-mvrj7qg8-c20c132e`: an unsure trial's advice rested on rows its judge invented, reached every
  // later judge, and the repair followed it. An unsure trial stood on no no Core grounded, so its advice is told to none (t771).
  it("tells a later judge nothing of a trial judged unsure", () => {
    const trials = [trial({ revision: 2, verdict: "unsure", advice: "Drop the club-link condition." }), trial({ revision: 3 })];
    const told = automationStudioResultEarlierAdvice({ trials, revision: 4, plan: PLAN_2 });
    expect(told.map((one) => one.revision)).toEqual([3]);
    expect(JSON.stringify(told)).not.toContain("Drop the club-link condition.");
  });
});
