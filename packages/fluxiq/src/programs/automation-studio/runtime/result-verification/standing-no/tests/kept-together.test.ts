// Conditions that left a row out only together, kept as one across a build's
// trials, and a later plan that writes none of them (t666, A8 frozen pair 8
// candidate towels `run-mvam0lys-2d3eb090`, revision 7), on a library's
// catalogue search: no task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import {
  AutomationStudioResultKeptConditionMemory,
  automationStudioResultKeptConditionsDropped,
  automationStudioResultStandingNoRecordOf,
  type AutomationStudioResultConditionPlan,
  type AutomationStudioResultStandingNoRecord
} from "../index.ts";

const READ = "node.bootstrap.7c1d.find_atlases.s2";
const ON_SHELF = { field: "status", contains: "On shelf" };
const ATLAS = { field: "title", contains: "Atlas" };
const NOT_POSTER = { field: "title", not: true, contains: "Poster" };

/** A plan of one read step whose conditions are `where`. */
function plan(where: readonly object[]): AutomationStudioResultConditionPlan {
  return { subflows: [{ key: "find_atlases", nodes: [
    { key: "s1", parameters: { url: "https://catalogue.test/search?q=atlas" } },
    { key: "s2", parameters: { extract: { where, fields: { title: "title", status: "status" } } } }
  ] }] };
}

const EXACT = plan([ON_SHELF, ATLAS, NOT_POSTER]);

/**
 * Core's record of a trial over the read: conditions 2 and 3 each left out no
 * row by themselves, and together left out one row, another copy of which the
 * result kept (`also_in_result`), or, with `unaccounted`, a row Core does not
 * account for.
 */
function record(options: { unaccounted?: boolean } = {}): AutomationStudioResultStandingNoRecord {
  return {
    stored: ["Coastal Atlas of the North, Poster Edition"], storedWhole: true, standing: [{ call: 1 }, { call: 2 }],
    conditions: [
      { name: "condition 1 (status contains [\"On shelf\"])", nodeId: READ, number: 1, leftOutAlone: ["River Atlas, Volume 3"] },
      { name: "condition 2 (title contains [\"Atlas\"])", nodeId: READ, number: 2, leftOutAlone: [] },
      { name: "condition 3 (title not contains [\"Poster\"])", nodeId: READ, number: 3, leftOutAlone: [] }
    ],
    together: [options.unaccounted
      ? { nodeId: READ, numbers: [2, 3], rows: ["Wall Poster of Lakes"] }
      : { nodeId: READ, numbers: [2, 3], rows: ["Coastal Atlas of the North, Poster Edition"], keptOut: [{ label: "Coastal Atlas of the North, Poster Edition", by: "also_in_result" }] }]
  };
}

describe("a set of conditions that left a row out only together (t666)", () => {
  it("is kept as one, naming each condition as the revision wrote it", () => {
    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 6, standingNo: record(), plan: EXACT });
    const [kept, ...rest] = memory.conditions();
    expect(rest).toEqual([]);
    expect(kept).toMatchObject({
      name: "condition 2 (title contains [\"Atlas\"]) and condition 3 (title not contains [\"Poster\"])",
      revision: 6,
      members: [
        { name: "condition 2 (title contains [\"Atlas\"])", written: JSON.stringify({ contains: "Atlas", field: "title" }) },
        { name: "condition 3 (title not contains [\"Poster\"])", written: JSON.stringify({ contains: "Poster", field: "title", not: true }) }
      ]
    });
    // Its written form is a JSON list a refusal can print.
    expect(JSON.parse(kept!.written)).toHaveLength(2);
  });

  it("is refused once where a plan writes none of its conditions, and never where it writes one", () => {
    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 6, standingNo: record(), plan: EXACT });
    const carried = memory.conditions();
    // Revision 7's move: both dropped, on advice that each "alone rejected 0 rows".
    const both = automationStudioResultKeptConditionsDropped({ carried, plan: plan([ON_SHELF]) });
    expect(both?.dropped).toHaveLength(1);
    expect(both?.said).toContain("Condition 2 (title contains [\"Atlas\"]) and condition 3 (title not contains [\"Poster\"]), as revision 6 wrote them ({\"contains\":\"Atlas\",\"field\":\"title\"} and {\"contains\":\"Poster\",\"field\":\"title\",\"not\":true}), left out together only this row: \"Coastal Atlas of the North, Poster Edition\" (another copy of it is in the result)");
    expect(both?.said).toContain("no one of them left it out by itself, so keeping any one of them as written keeps it out.");
    expect(both?.said).toContain("Core refuses this once, not twice");
    // Loosened, both: still none written as written.
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: plan([ON_SHELF, { field: "title", contains: "Atl" }]) })?.dropped).toHaveLength(1);
    // One dropped, the other kept: the row stays out, nothing to say.
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: plan([ON_SHELF, ATLAS]) })).toBeUndefined();
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: plan([{ contains: "Poster", not: true, field: "title" }, ON_SHELF]) })).toBeUndefined();
    // Sent again after its refusal: accepted.
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: plan([ON_SHELF]), refused: new Set([carried[0]!.written]) })).toBeUndefined();
  });

  it("is taken back by a later record showing the same set leaving out a row Core does not account for", () => {
    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 6, standingNo: record(), plan: EXACT });
    // The same set at other places: the record numbers conditions as the plan that ran wrote them.
    memory.remember({ revision: 7, standingNo: { ...record({ unaccounted: true }), together: [{ nodeId: READ, numbers: [1, 2], rows: ["Wall Poster of Lakes"] }] }, plan: plan([ON_SHELF, NOT_POSTER, ATLAS]) });
    expect(memory.conditions()).toHaveLength(1);
    memory.remember({ revision: 8, standingNo: record({ unaccounted: true }), plan: EXACT });
    expect(memory.conditions()).toEqual([]);
  });

  it("keeps nothing where a member cannot be found as the plan wrote it, or the set is not of the shape", () => {
    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 6, standingNo: record(), plan: plan([ON_SHELF, ATLAS]) });
    expect(memory.conditions()).toEqual([]);
    expect(automationStudioResultStandingNoRecordOf({ ...record(), together: [{ nodeId: READ, numbers: [2], rows: [] }] })).toBeUndefined();
    expect(automationStudioResultStandingNoRecordOf({ ...record(), together: [{ nodeId: READ, numbers: [2, 3], rows: ["x"], keptOut: [{ label: "x", by: "judge_said" }] }] })).toBeUndefined();
    expect(automationStudioResultStandingNoRecordOf(record())?.together).toEqual(record().together);
    // A carried set whose members are not of the shape is no kept condition.
    const carried = [{ name: "x", revision: 1, written: "[]", keptOut: [{ label: "x", by: "also_in_result" }], members: [{ name: "x" }] }];
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: plan([]) })).toBeUndefined();
  });

  it("is said in words naming no site, task or product of a realistic scenario", () => {
    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 6, standingNo: record(), plan: EXACT });
    const words = String(automationStudioResultKeptConditionsDropped({ carried: memory.conditions(), plan: plan([]) })?.said).replace(/"[^"]*"/gu, "").replace(/\{[^}]*\}/gu, "");
    expect(words).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);
  });
});
