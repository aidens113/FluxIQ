// Each kept row reaches the judge with the values the result's processing read on it (t1072).
//
// Run `run-mwyfoz8o-507c92f6` (0101): a saved Flow's replay kept the right rows in the right order, and the judge said no
// because the sort key, a field the asked columns leave out, was in no row it was shown. The first group rebuilds that
// judge's evidence offline from the recorded pages and declaration and holds the rebuilt request to carrying, per kept
// row, the sort key and every filter's field, with Core's reading of whether they run in that key's order. The others are the rule on made-up rows (a garden centre's plants).
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../../../../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstKeptKeyRows } from "../../../kept-key-rows.ts";
import { readAutomationStudioAnswerFirstResultEvidence } from "../../../read-evidence.ts";
import { automaticFeed, REFERENCE } from "../../automatic-support.ts";
import { resultPipeline } from "../../pipeline.ts";
import { RUN_MWYFOZ8O_FIELDS, RUN_MWYFOZ8O_INSTRUCTION, RUN_MWYFOZ8O_KEPT, RUN_MWYFOZ8O_PAGES, RUN_MWYFOZ8O_PROCESS } from "./judge-0101-fixture.ts";

/** The read's six fields, every one text, as the recorded read captured them. */
const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: RUN_MWYFOZ8O_FIELDS.map((id) => ({ id, label: id, valueType: "string" as const })) };

function rebuilt() {
  const { feed, read } = automaticFeed(RUN_MWYFOZ8O_PROCESS, REFERENCE, RUN_MWYFOZ8O_INSTRUCTION);
  RUN_MWYFOZ8O_PAGES.forEach((page, index) => read(`r${index + 1}`, page.rows, SCHEMA, page.place ?? `page=${index + 1}`));
  return feed;
}

describe("0101's evidence, rebuilt from run-mwyfoz8o-507c92f6's recorded pages and declaration", () => {
  it("keeps the rows the recorded answer kept, in its order", () => {
    const rows = rebuilt().rows();
    expect(rows.rows.map((row) => [row.title, row.link])).toEqual(RUN_MWYFOZ8O_KEPT.map((row) => [row.title, row.link]));
  });

  it("carries, for each kept row in the answer's order, the sort key and every filter's field beside the asked columns", () => {
    const processing = rebuilt().evidence().processing;
    expect(processing).toMatchObject({ collected: 30, kept: 7 });
    const kept = processing?.keptRows ?? [];
    expect(kept.map((row) => [row.title, row.posted])).toEqual([
      ["Senior Rust Engineer", "Today"],
      ["Rust Engineer, Settlement Systems", "Posted 1 day ago"],
      ["Backend Engineer – Rust", "Posted 3 days ago"],
      ["Staff Rust Engineer", "Posted 4 days ago"],
      ["Rust Developer (Embedded)", "Posted 6 days ago"],
      ["Principal Engineer (Rust, Distributed Systems)", "Posted 9 days ago"],
      ["Rust Platform Engineer", "Posted 13 days ago"]
    ]);
    // The asked columns first, then what the declaration read: the location it filters on, the derived salary floor
    // beside the salary it is derived from, and the sort key.
    expect(Object.keys(kept[0]!)).toEqual(["title", "company", "salary", "link", "location", "salary_min", "posted"]);
    expect(kept.map((row) => row.location)).toEqual(Array(7).fill("Remote (UK)"));
    expect(kept.map((row) => row.salary_min)).toEqual([85000, 72000, 90000, 95000, 70000, 110000, 75000]);
  });

  it("carries Core's own reading of the hidden sort key beside them: read as a date on every kept row, and in its order", () => {
    const keys = rebuilt().evidence().processing?.hiddenSortKeys ?? [];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ field: "posted", position: 0, order: "desc", kind: "date", read: 7, inOrder: true });
    // A few readings, newest first, never the page's words.
    const readings = keys[0]!.readings ?? [];
    expect(readings).toHaveLength(4);
    expect(readings.every((reading, index) => typeof reading === "number" && (index === 0 || reading <= readings[index - 1]!))).toBe(true);
  });

  it("is in the request the judge's model is sent, row by row", () => {
    const feed = rebuilt();
    const rows = feed.rows();
    const { sent } = automationStudioFlowLessJudgedSummary({ instructions: RUN_MWYFOZ8O_INSTRUCTION, rows: { totalRows: rows.totalRows, truncated: rows.truncated, columns: rows.columns, rows: rows.rows }, acts: [], resultEvidence: feed.evidence() }, []);
    const shown = (sent as unknown as { resultEvidence: { processing: { keptRows: JsonObject[] } } }).resultEvidence.processing.keptRows;
    expect(shown).toHaveLength(7);
    expect(shown.every((row) => typeof row.posted === "string" && row.posted.length > 0)).toBe(true);
    expect((sent as unknown as { question: string }).question).toContain("resultEvidence.processing.keptRows");
    expect((sent as unknown as { resultEvidence: { processing: { hiddenSortKeys: { inOrder?: boolean }[] } } }).resultEvidence.processing.hiddenSortKeys[0]?.inOrder).toBe(true);
    expect((sent as unknown as { question: string }).question).toContain("resultEvidence.processing.hiddenSortKeys");
  });

  it("reads back from the attempt's stored bundle whole", () => {
    const evidence = rebuilt().evidence();
    const back = readAutomationStudioAnswerFirstResultEvidence(JSON.parse(JSON.stringify(evidence)));
    expect(back?.processing?.keptRows).toEqual(evidence.processing?.keptRows);
    expect(back?.processing?.hiddenSortKeys).toEqual(evidence.processing?.hiddenSortKeys);
    // A stored list that is not one row per kept row is not this evidence.
    const short = JSON.parse(JSON.stringify(evidence)) as { processing: { keptRows: JsonObject[] } };
    short.processing.keptRows.pop();
    expect(readAutomationStudioAnswerFirstResultEvidence(short)).toBeUndefined();
  });
});

describe("each kept row with the values processing read on it", () => {
  const PLANTS = [
    { name: "Lavender", height: "40cm", flowers: "June", note: "Scented" },
    { name: "Foxglove", height: "150cm", flowers: "May" }
  ];

  it("adds nothing where every value the declaration reads is an asked column", () => {
    expect(automationStudioAnswerFirstKeptKeyRows(PLANTS, { where: [{ field: "name", contains: "a" }], sort: [{ field: "height", order: "asc" }] }, ["name", "height"], REFERENCE)).toBeUndefined();
    expect(automationStudioAnswerFirstKeptKeyRows(PLANTS, {}, ["name"], REFERENCE)).toBeUndefined();
  });

  it("says a derived column after its source, its source's source first, and null where a row holds no value", () => {
    const rows = automationStudioAnswerFirstKeptKeyRows(PLANTS, {
      derive: [{ id: "cm", from: "height", pattern: "([0-9]+)", as: "number" }, { id: "metres", from: "cm", as: "number" }],
      where: [{ field: "note", is: "present" }],
      sort: [{ field: "metres", order: "desc" }]
    }, ["name"], REFERENCE);
    expect(rows).toEqual([
      { name: "Lavender", note: "Scented", height: "40cm", cm: 40, metres: 40 },
      { name: "Foxglove", note: null, height: "150cm", cm: 150, metres: 150 }
    ]);
  });

  it("reaches the judge on the legacy path too, from a read's own processing over a column it does not show", async () => {
    const p = resultPipeline("List the plants, tallest first, with columns name.");
    const value = p.input([], { name: ".name", height: ".height", flowers: ".flowers" }, { sort: [{ field: "height", order: "desc", as: "number" }], columns: ["name"] });
    await p.read({ source: "s1", value, rows: [{ name: "Lavender", height: "40", flowers: "June" }, { name: "Foxglove", height: "150", flowers: "May" }] });
    expect(p.feed.rows().rows).toEqual([{ name: "Foxglove" }, { name: "Lavender" }]);
    expect(p.feed.evidence().processing?.keptRows).toEqual([{ name: "Foxglove", height: "150" }, { name: "Lavender", height: "40" }]);
  });
});
