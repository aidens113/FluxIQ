// A presence condition the request excludes in its own words is kept across a
// build's trials (t660 fix 5, t659 round 2; A8 frozen pair 6 project towels
// `run-mvac0nmw-52ed30b2` step 0134): `reference is absent` alone left out four
// rows that are also rows of the result and one on which Core's read found
// "Reference", and the request says "leaving out reference copies". Core's
// record accounts for every one, so the condition is kept from an unsure trial,
// a later plan that drops it is refused once, and the same plan sent again is
// accepted. A library's catalogue search: no task, site, item or answer of any
// realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultStandingNoRecord } from "../../standing-no-record/index.ts";
import { AutomationStudioResultKeptConditionMemory, automationStudioResultKeptConditionsDropped, type AutomationStudioResultConditionPlan } from "../index.ts";

const READ = "node.bootstrap.5e6f.find_books.s3";
const LEAVING_OUT = "List the branch's books on birds rated 4 or higher, leaving out reference copies, going through every page, with columns title and rating.";
const INCLUDING = "List the branch's books on birds rated 4 or higher, including reference copies, going through every page, with columns title and rating.";

const STORED = ["Garden Birds of the North", "Owls and Their Calls", "Shorebirds of the Coast", "Birds of the High Moor"];
/** Left out by condition 1 alone, its reference mark read by Core, and no copy of it stored. */
const ATLAS = "Field Atlas of Wading Birds";

const NOT_REFERENCE = { field: "reference", is: "absent" };
const RATED = { field: "rating", atLeast: 4 };

/** The run: condition 1 left out a copy of each stored title, and the atlas whose witness is `witness`. */
function summary(witness = "Reference"): AutomationStudioRunResultSummary {
  const leftOut = [...STORED, ATLAS];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "books", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["title", "rating"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: STORED.map((title) => ({ title, rating: "4.5" })),
      processing: { collected: 4, duplicates: 0, filteredOut: 0, cut: 0, kept: 4, passes: [{ node: READ, pass: 1, rows: 4, newRows: 4 }] }
    }],
    reads: [{
      nodeId: READ, definitionId: "extract_list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 9, kept: 4,
      conditions: [
        {
          number: 1, condition: "reference is absent", rejected: 5, alone: 5, leftOutOnlyByThis: leftOut,
          leftOutObservations: leftOut.map((_, at) => ({ source: "read" as const, page: 1, item: at + 1, readKind: "text" as const, state: "present" as const, value: at === STORED.length ? witness : "Reference" })),
          leftOutSettled: [ATLAS],
          settled: "On each row in leftOutSettled the read found reference, as that row's witness in leftOutObservations gives it, and Core tested that value against condition 1 as written: each fails it."
        },
        { number: 2, condition: "rating atLeast 4", rejected: 0, alone: 0 }
      ]
    }],
    flowShape: [{ nodeId: "node.bootstrap.5e6f.find_books.s1", definitionId: "type_text" }, { nodeId: READ, definitionId: "extract_list" }],
    withheld: false
  };
}

/** A plan of the read step whose conditions are `where`. */
function plan(where: readonly object[]): AutomationStudioResultConditionPlan {
  return { subflows: [{ key: "find_books", nodes: [
    { key: "s1", parameters: { url: "https://catalogue.test" } },
    { key: "s3", parameters: { extract: { where, fields: { title: "title", rating: "rating" } } } }
  ] }] };
}

/** Core's record of an unsure trial over the run (no call's no stands): what the gate is handed. */
function standingNo(body = LEAVING_OUT, witness?: string) {
  const run = summary(witness);
  const wording = automationStudioRequestWording([{ title: "Goal", body }], run)!;
  const record = automationStudioResultNoRecord({ summary: run, requestText: `Goal\n${body}`, wording });
  return automationStudioResultStandingNoRecord({ calls: [], record, summary: run, wording });
}

const kept = (standing: ReturnType<typeof standingNo>) => {
  const memory = new AutomationStudioResultKeptConditionMemory();
  memory.remember({ revision: 3, standingNo: standing, plan: plan([NOT_REFERENCE, RATED]) });
  return memory.conditions();
};

describe("a presence condition the request excludes in its own words (t660, t659 round 2)", () => {
  it("accounts every row it left out alone: four other copies, and one by the request's words", () => {
    const condition = standingNo().conditions.find((entry) => entry.number === 1);
    expect(condition?.keptOut).toEqual([
      ...STORED.map((label) => ({ label, by: "also_in_result" })),
      { label: ATLAS, by: "request_words", texts: ["reference"] }
    ]);
  });

  it("is kept from an unsure trial, its drop refused once in Core's words, and the same plan sent again accepted", () => {
    const carried = kept(standingNo());
    expect(carried.map((condition) => condition.name)).toEqual(["condition 1 (reference is absent)"]);
    const dropping = plan([RATED]);
    const found = automationStudioResultKeptConditionsDropped({ carried, plan: dropping });
    expect(found?.dropped.map((condition) => condition.name)).toEqual(["condition 1 (reference is absent)"]);
    expect(found?.said).toContain("Core refuses this once, not twice");
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: dropping, refused: new Set(found!.dropped.map((condition) => condition.written)) })).toBeUndefined();
  });

  it("is not kept where the request asks for those rows, or the value Core read is not the request's", () => {
    expect(kept(standingNo(INCLUDING))).toEqual([]);
    expect(kept(standingNo(LEAVING_OUT, "Staff pick"))).toEqual([]);
  });
});
