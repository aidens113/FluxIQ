// A read's rows two or more conditions left out together (t655) are read as one
// left-out group (debug of `run-mvtdoyf3-47ffaac1`, F1 a): named by every
// condition that left them out, their labels kept, and never settled, since no
// one condition's value is the reason. From a run's account and from a build
// test's replayed read alike, for the readers that ask for them. A library catalog (`./wall-calendar-fixture.ts`).
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../../../contracts/index.ts";
import { automationStudioRequestRowsReads } from "../../../summary-reads.ts";
import { automationStudioResultLeftOutRowsUnquoted } from "../../../unquoted-rows.ts";
import { WALL_CALENDAR_CONDITIONS, WALL_CALENDAR_KEPT, WALL_CALENDAR_ROW, WALL_CALENDAR_TOGETHER, wallCalendarRunSummary, wallCalendarWording } from "./wall-calendar-fixture.ts";

/** What the yes guard and the left-out fact ask for; every other reader reads a read as before. */
const TOGETHER = { together: true };

describe("rows several conditions left out together, as a summary's reads hold them (F1 a)", () => {
  it("are left out of the reads every other reader asks for, as before", () => {
    const [read] = automationStudioRequestRowsReads(wallCalendarRunSummary()).reads;
    expect(read?.conditions.map((condition) => condition.condition)).toEqual([`condition 1 (${WALL_CALENDAR_CONDITIONS[0]})`]);
    expect(read?.labels).not.toContain(WALL_CALENDAR_ROW);
  });

  it("are one unsettled condition of a run's read, named by each condition with its labels", () => {
    const [read] = automationStudioRequestRowsReads(wallCalendarRunSummary(), false, TOGETHER).reads;
    const group = read?.conditions.find((condition) => condition.together);
    expect(group).toEqual({
      condition: WALL_CALENDAR_TOGETHER,
      rows: [WALL_CALENDAR_ROW],
      labels: [WALL_CALENDAR_ROW],
      testedLabel: false,
      together: true,
      tests: [{ number: 2, wording: WALL_CALENDAR_CONDITIONS[1] }, { number: 3, wording: WALL_CALENDAR_CONDITIONS[2] }]
    });
    expect(group?.settled).toBeUndefined();
    expect(read?.kept).toEqual(WALL_CALENDAR_KEPT);
    expect(read?.labels).toContain(WALL_CALENDAR_ROW);
  });

  it("are one condition of a build test's replayed read, named by each field", () => {
    const summary = {
      ...wallCalendarRunSummary(),
      reads: [],
      recordSets: [],
      buildTest: {
        kind: "build_test", test: "ran",
        steps: [{
          step: 2, action: "extract_list", outcome: "replayed",
          observed: { readRows: { rows: WALL_CALENDAR_KEPT, leftOutTogether: [{ numbers: [1, 2], conditions: ["title", "format"], rows: [WALL_CALENDAR_ROW] }] } }
        }]
      }
    } as unknown as AutomationStudioRunResultSummary;
    const [read] = automationStudioRequestRowsReads(summary, false, TOGETHER).reads;
    expect(read?.conditions).toEqual([{
      condition: "conditions 1 and 2 (title; format)", rows: [WALL_CALENDAR_ROW], labels: [WALL_CALENDAR_ROW], testedLabel: false, together: true,
      tests: [{ number: 1, field: "title" }, { number: 2, field: "format" }]
    }]);
  });

  it("follow t691 as before where another read stored the row", () => {
    const base = wallCalendarRunSummary();
    const summary: AutomationStudioRunResultSummary = {
      ...base,
      recordSets: [...base.recordSets, {
        datasetId: "everything", recordCount: 1, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false,
        rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ title: WALL_CALENDAR_ROW }],
        processing: { collected: 1, duplicates: 0, filteredOut: 0, cut: 0, kept: 1, passes: [{ node: "reread", pass: 1, rows: 1, newRows: 1 }] }
      }],
      reads: [...base.reads!, { nodeId: "reread", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 1, kept: 1 }]
    };
    const [read] = automationStudioRequestRowsReads(summary, false, TOGETHER).reads;
    expect(read?.storedElsewhere).toEqual([{ label: WALL_CALENDAR_ROW, by: ["reread"] }]);
    const reply = `Condition 1 (reference is absent) carries out "leaving out reference copies".\nThe ${WALL_CALENDAR_ROW} row was excluded by conditions 2 and 3.`;
    // Held as a left-out row, and more: named beside the read that stored it (t691).
    expect(automationStudioResultLeftOutRowsUnquoted(summary, reply, wallCalendarWording(undefined, summary))).toEqual([
      { nodeId: "read", condition: WALL_CALENDAR_TOGETHER, rows: [WALL_CALENDAR_ROW] },
      { nodeId: "read", condition: WALL_CALENDAR_TOGETHER, rows: [WALL_CALENDAR_ROW], stored: ["reread"] }
    ]);
  });
});
