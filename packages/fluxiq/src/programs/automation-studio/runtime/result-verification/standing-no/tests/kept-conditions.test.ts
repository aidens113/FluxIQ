// The conditions Core's record showed keep out only rows the request does not
// ask for, kept across a build's trials, and a later plan that no longer writes
// one (t641, A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1`), on a
// library's catalogue search: no task, site, item or answer of any realistic
// scenario.
import { describe, expect, it } from "vitest";
import {
  AutomationStudioResultKeptConditionMemory,
  automationStudioResultKeptConditionsDropped,
  automationStudioResultWrittenCondition,
  type AutomationStudioResultConditionPlan,
  type AutomationStudioResultStandingNoRecord
} from "../index.ts";

const READ = "node.bootstrap.5e6f.find_books.s3";
const ON_SHELF = { field: "status", contains: "On shelf" };
const NOT_FEATURED = { field: "featured", is: "absent" };
const PAGES = { field: "pages", atMost: 300 };

/** A plan of one read step whose conditions are `where`, and a saved answer's `process.where`. */
function plan(where: readonly object[], processWhere: readonly object[] = []): AutomationStudioResultConditionPlan {
  return { subflows: [{ key: "find_books", nodes: [
    { key: "s1", parameters: { url: "https://catalogue.test" } },
    { key: "s3", parameters: { extract: { where, fields: { title: "title" } }, recordOutput: { datasetId: "books", process: { where: processWhere } } } }
  ] }] };
}

/** Core's record of a no over the read: condition 1 kept out a copy of a stored row, 2 a row failing the request's words, 3 a row Core did not settle. */
function record(options: { onShelfUnaccounted?: boolean } = {}): AutomationStudioResultStandingNoRecord {
  return {
    stored: ["A Field Guide to Ferns"], storedWhole: true, standing: [{ call: 1 }, { call: 2 }],
    conditions: [
      { name: "condition 1 (featured is absent)", nodeId: READ, number: 1, leftOutAlone: ["A Field Guide to Ferns"], keptOut: [{ label: "A Field Guide to Ferns", by: "also_in_result" }] },
      options.onShelfUnaccounted
        ? { name: "condition 2 (status contains [\"On shelf\"])", nodeId: READ, number: 2, leftOutAlone: ["Mosses of the North"] }
        : { name: "condition 2 (status contains [\"On shelf\"])", nodeId: READ, number: 2, leftOutAlone: ["Mosses of the North"], keptOut: [{ label: "Mosses of the North", by: "request_words", texts: ["On shelf"] }] },
      { name: "condition 3 (pages atMost 300)", nodeId: READ, number: 3, leftOutAlone: ["Lichens, Volume 2"] },
      { name: "recordOutput.process.where condition 1 (title not contains [\"Workbook\"])", nodeId: READ, number: 1, leftOutAlone: ["Ferns Workbook"], keptOut: [{ label: "Ferns Workbook", by: "request_words", texts: ["Workbook"] }] }
    ]
  };
}

const EXACT = plan([NOT_FEATURED, ON_SHELF, PAGES], [{ field: "title", not: true, contains: "Workbook" }]);

describe("a condition as a plan writes it", () => {
  it("is found by its read's node id and number, a saved answer's under its process", () => {
    expect(automationStudioResultWrittenCondition(EXACT, record().conditions[1]!)).toBe(JSON.stringify({ contains: "On shelf", field: "status" }));
    expect(automationStudioResultWrittenCondition(EXACT, record().conditions[3]!)).toBe(JSON.stringify({ contains: "Workbook", field: "title", not: true }));
    // A node id naming no step, or a number past the list, finds nothing.
    expect(automationStudioResultWrittenCondition(EXACT, { name: "condition 1", nodeId: "node.bootstrap.5e6f.find_books.s9", number: 1 })).toBeUndefined();
    expect(automationStudioResultWrittenCondition(EXACT, { name: "condition 7", nodeId: READ, number: 7 })).toBeUndefined();
  });
});

describe("a gate's kept conditions (t641)", () => {
  it("keeps each condition whose every row left out alone Core's record accounts for, as the revision wrote it, and no other", () => {
    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 3, standingNo: record(), plan: EXACT });
    expect(memory.conditions().map((condition) => condition.name)).toEqual([
      "condition 1 (featured is absent)", "condition 2 (status contains [\"On shelf\"])", "recordOutput.process.where condition 1 (title not contains [\"Workbook\"])"
    ]);
    expect(memory.conditions()[0]).toMatchObject({ revision: 3, written: JSON.stringify({ field: "featured", is: "absent" }) });
  });

  it("lets a later trial's record that shows a kept condition leaving out a row Core does not account for take it back", () => {
    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 3, standingNo: record(), plan: EXACT });
    memory.remember({ revision: 5, standingNo: record({ onShelfUnaccounted: true }), plan: EXACT });
    expect(memory.conditions().map((condition) => condition.name)).not.toContain("condition 2 (status contains [\"On shelf\"])");
    expect(memory.conditions().find((condition) => condition.name.startsWith("condition 1"))?.revision).toBe(5);
  });

  it("keeps nothing from a value not of the record's shape, or without the plan that ran", () => {
    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 1, standingNo: { stored: "x" }, plan: EXACT });
    memory.remember({ revision: 2, standingNo: record(), plan: undefined });
    memory.remember({ revision: 3, standingNo: { ...record(), conditions: [{ name: "condition 1", keptOut: [{ label: "x", by: "judge_said" }] }] }, plan: EXACT });
    expect(memory.conditions()).toEqual([]);
  });
});

describe("a plan that no longer writes a kept condition (t641)", () => {
  const memory = new AutomationStudioResultKeptConditionMemory();
  memory.remember({ revision: 3, standingNo: record(), plan: EXACT });
  const carried = memory.conditions();

  it("is found, and said in Core's words: the condition, as written, and the rows it kept out", () => {
    const found = automationStudioResultKeptConditionsDropped({ carried, plan: plan([ON_SHELF, PAGES], [{ field: "title", not: true, contains: "Workbook" }]) });
    expect(found?.dropped.map((condition) => condition.name)).toEqual(["condition 1 (featured is absent)"]);
    expect(found?.said).toContain("Condition 1 (featured is absent), as revision 3 wrote it ({\"field\":\"featured\",\"is\":\"absent\"}), left out by itself only this row: \"A Field Guide to Ferns\" (another copy of it is in the result).");
    expect(found?.said).toContain("this Flow no longer writes it as it was written");
    expect(found?.said).toContain("Core refuses this once, not twice");
  });

  it("counts a loosened condition as no longer written, and a moved or reordered one as still written", () => {
    const loosened = automationStudioResultKeptConditionsDropped({ carried, plan: plan([NOT_FEATURED, { field: "status", contains: "shelf" }], [{ contains: "Workbook", not: true, field: "title" }]), subject: "subflow" });
    expect(loosened?.dropped.map((condition) => condition.name)).toEqual(["condition 2 (status contains [\"On shelf\"])"]);
    expect(loosened?.said).toContain("this subflow no longer writes it");
    expect(loosened?.said).toContain("fails the request's words \"On shelf\"");
    // The saved answer's condition moved into the read, keys reordered: still written.
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: plan([{ is: "absent", field: "featured" }, ON_SHELF, { field: "title", not: true, contains: "Workbook" }]) })).toBeUndefined();
  });

  it("leaves out what a submission was already refused for, and reads nothing from a value not of the shape", () => {
    const dropped = plan([PAGES]);
    const refused = new Set(carried.slice(0, 2).map((condition) => condition.written));
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: dropped, refused })?.dropped.map((condition) => condition.name)).toEqual(["recordOutput.process.where condition 1 (title not contains [\"Workbook\"])"]);
    expect(automationStudioResultKeptConditionsDropped({ carried: [{ name: "condition 1", revision: 1, written: "{}", keptOut: [] }], plan: dropped })).toBeUndefined();
    expect(automationStudioResultKeptConditionsDropped({ carried: "kept", plan: dropped })).toBeUndefined();
  });

  it("is said in words naming no site, task or product of a realistic scenario", () => {
    const found = automationStudioResultKeptConditionsDropped({ carried, plan: plan([]) });
    const words = String(found?.said).replace(/"[^"]*"/gu, "");
    expect(words).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);
  });
});
