// What an earlier judged trial of the same build advised, and whether the
// revision now asked about changed what that advice named (t752,
// `../earlier-advice.ts`), on a library's catalogue search: no task, site,
// item or answer of any realistic scenario.
//
// Located-only (P5b): what a later judge is told is what Core located in its
// record of the earlier trial -- the kind and row as located -- never the earlier
// judge's prose advice or a claim Core did not locate.
import { describe, expect, it } from "vitest";
import { automationStudioResultEarlierAdvice, automationStudioResultLocatedAdvice, type AutomationStudioResultConditionPlan, type AutomationStudioResultStandingNoRecord } from "../index.ts";

/** The read as revision 2's Flow named it, and as revision 3's: the same step under another hash. */
const READ_2 = "node.bootstrap.aa11bb22.find_books.s3";
const ON_SHELF = { field: "status", contains: "On shelf" };
const ON_SHELF_OR_HOLD = { field: "status", contains: ["On shelf", "On hold"] };
const PAGES = { field: "pages", atMost: 300 };
const MISSING = "Ferns on Hold";
const JUDGE_PROSE = "Also accept books on hold; the status condition is the whole problem.";

function plan(where: readonly object[]): AutomationStudioResultConditionPlan {
  return { subflows: [{ key: "find_books", nodes: [
    { key: "s1", parameters: { url: "https://catalogue.test" } },
    { key: "s3", parameters: { extract: { where, fields: { title: "title" } } } }
  ] }] };
}

/** Core's record of revision 2's no: its read's conditions, the first leaving a row out alone, and the defects Core located. */
function record(over: Partial<AutomationStudioResultStandingNoRecord> = {}): AutomationStudioResultStandingNoRecord {
  return {
    stored: ["A Field Guide to Ferns"], storedWhole: true, standing: [{ call: 1 }, { call: 2 }],
    conditions: [
      { name: "condition 1 (status contains [\"On shelf\"])", nodeId: READ_2, number: 1, leftOutAlone: [MISSING] },
      { name: "condition 2 (pages atMost 300)", nodeId: READ_2, number: 2, leftOutAlone: [] }
    ],
    located: [{ kind: "asked_missing", row: MISSING }],
    ...over
  };
}

const PLAN_2 = plan([ON_SHELF, PAGES]);
const LOCATED = automationStudioResultLocatedAdvice(record().located)!;
const trial = (over: Partial<{ revision: number; verdict: "no" | "unsure"; advice: string; standingNo: unknown; plan: AutomationStudioResultConditionPlan }> = {}) =>
  ({ revision: 2, verdict: "no" as const, advice: LOCATED, standingNo: record(), plan: PLAN_2, ...over });

describe("the located defects of an earlier judged trial, as a later trial's judge is told them (P5b)", () => {
  it("says Core's located defect as the kind and row it located, never a judge's prose", () => {
    expect(LOCATED).toBe('Core located these defects in its record of that trial: it lacks "Ferns on Hold", which the request asks for.');
    expect(automationStudioResultLocatedAdvice([{ kind: "kept_not_asked", row: "Seed Catalogue" }, { kind: "wrong_value", row: "Moss Atlas", column: "pages" }]))
      .toBe('Core located these defects in its record of that trial: it keeps "Seed Catalogue", which the request does not ask for; "Moss Atlas" holds a wrong value in column "pages".');
    expect(automationStudioResultLocatedAdvice(undefined)).toBeUndefined();
    expect(automationStudioResultLocatedAdvice([{ kind: "other", row: "formatting" }])).toBeUndefined();
  });

  it("says the revision changed the condition that alone left the located row out, matched across the revisions' hashes", () => {
    const [told, ...rest] = automationStudioResultEarlierAdvice({ trials: [trial()], revision: 3, plan: plan([ON_SHELF_OR_HOLD, PAGES]) });
    expect(rest).toEqual([]);
    expect(told).toEqual({
      revision: 2, verdict: "no", advice: LOCATED, followed: "changed",
      named: ["condition 1 (status contains [\"On shelf\"]) of step find_books.s3"],
      said: `After the trial of revision 2 (judged no) ${LOCATED} Revision 3 changed condition 1 (status contains ["On shelf"]) of step find_books.s3, which alone left a row out there.`
    });
  });

  it("says the revision left that condition as it was, wherever its list now numbers it", () => {
    const [kept] = automationStudioResultEarlierAdvice({ trials: [trial()], revision: 3, plan: PLAN_2 });
    expect(kept).toMatchObject({ followed: "unchanged", named: ["condition 1 (status contains [\"On shelf\"]) of step find_books.s3"] });
    expect(kept!.said).toContain("Revision 3 left condition 1 (status contains [\"On shelf\"]) of step find_books.s3 as revision 2 wrote it, though it alone left a row out there.");
    const [renumbered] = automationStudioResultEarlierAdvice({ trials: [trial()], revision: 3, plan: plan([PAGES, ON_SHELF]) });
    expect(renumbered).toMatchObject({ followed: "unchanged" });
  });

  it("says unknown where no located row traces to a condition, and never reads a judge's words for one", () => {
    const kept = record({ located: [{ kind: "kept_not_asked", row: "Seed Catalogue" }] });
    const [told] = automationStudioResultEarlierAdvice({ trials: [trial({ standingNo: kept, advice: automationStudioResultLocatedAdvice(kept.located)! })], revision: 3, plan: plan([ON_SHELF_OR_HOLD, PAGES]) });
    expect(told).toMatchObject({ followed: "unknown" });
    expect(told).not.toHaveProperty("named");
    expect(told!.said).toContain("Core could not tell which conditions that names, so whether revision 3 changed them is not known.");
    // A node id and a condition number in the advice are no longer read: only Core's located rows resolve a condition.
    const prose = automationStudioResultEarlierAdvice({ trials: [trial({ standingNo: record({ located: undefined }), advice: `Loosen condition 1 of ${READ_2}.` })], revision: 3, plan: plan([ON_SHELF_OR_HOLD, PAGES]) });
    expect(prose[0]).toMatchObject({ followed: "unknown" });
  });

  it("hands all completed trials judged no, oldest first, and none judged unsure", () => {
    const trials = [1, 2, 3, 5].map((revision) => trial({ revision }));
    expect(automationStudioResultEarlierAdvice({ trials, revision: 5, plan: PLAN_2 }).map((one) => one.revision)).toEqual([1, 2, 3, 5]);
    const mixed = [trial({ revision: 2, verdict: "unsure" }), trial({ revision: 3 })];
    const told = automationStudioResultEarlierAdvice({ trials: mixed, revision: 4, plan: PLAN_2 });
    expect(told.map((one) => one.revision)).toEqual([3]);
    expect(JSON.stringify(told)).not.toContain(JUDGE_PROSE);
  });
});
