// Rows that met every condition of the result are never replaced by a read that did not (`../row-sink.ts`).
// Live run run-mwaudvnh-c208d32c: a right 16-row result read under four conditions became 15, then 27 unfiltered
// rows when the model made look-only reads with no condition (steps 0219, 0250), after a judge wrongly said no. Each
// test stores through the sink and puts the note on the read's answer as the attempt's call chain does
// (`../../attempt/call-chain.ts`). A kind of site no realistic scenario is: a parish hall's bookings.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import { automationStudioAnswerFirstResultChangeTold, automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

const HALL = "http://127.0.0.1:5000/bookings?month=may&sort=rating";
const at = (page: number) => ({ location: `${HALL}&page=${page}` });
const FIELDS = { title: "span_title", price: "span_price" };
/** Another page of the hall's site: the bookings a person holds, not the list the result was read from. */
const MINE = { location: "http://127.0.0.1:5000/my-reservations" };
const FOUR: JsonValue[] = [
  { field: "div_promo", is: "absent" },
  { field: "span_rating", atLeast: 4.5 },
  { field: "span_title", contains: "Annex", not: true },
  { field: "span_title", contains: "Kitchen", not: true }
];

/** A read of the list as the model asks it: its columns, and its conditions where it has any. */
const read = (callId: string, where?: JsonValue[], fields: JsonObject = FIELDS, recordOutput?: JsonObject) =>
  call(callId, "core.run_node", { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.1", fields, ...(where ? { where } : {}), minItems: 0 }, ...(recordOutput ? { recordOutput } : {}) } });

const booking = (n: number): JsonObject => ({ title: `Booking ${n}`, price: `${n}.00` });
const withPromo = (n: number): JsonObject => ({ ...booking(n), promo: n % 4 === 0 ? "Promoted" : "" });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, at) => from + at);

function sinkOver() {
  const store = stubStore();
  return automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) });
}

type Sink = ReturnType<typeof sinkOver>;

/** One call through the sink, its answer as the model's next request shows it: read at a page of the hall's list, or where `said` says (none: the answer names no address). */
async function asked(sink: Sink, readCall: ReturnType<typeof read>, rows: JsonObject[], page: number | JsonObject) {
  const answer = liveAnswer(rows, typeof page === "number" ? at(page) : page);
  const stored = await sink.fromCall(readCall, answer);
  const told = stored?.resultChanged ? automationStudioAnswerFirstResultChangeTold(answer, stored.resultChanged) : answer;
  return { stored, note: (told.evidence as JsonObject).resultList as JsonObject | undefined };
}

/** The 16-row result: page 1 kept 11 rows and page 2 kept 5, both under the four conditions. */
async function rightResult(sink: Sink) {
  await asked(sink, read("p1.four", FOUR), range(1, 11).map(booking), 1);
  await asked(sink, read("p2.four", FOUR), range(12, 16).map(booking), 2);
  expect(sink.summary().totalRows).toBe(16);
}

describe("a read without every condition of the result", () => {
  it("leaves the 16-row result as it is and tells the model why, read after read (run-mwaudvnh-c208d32c, 0219 and 0250)", async () => {
    const sink = sinkOver();
    await rightResult(sink);
    const pagesBefore = sink.readPages();

    // 0219: page 1 again with a promo column and no condition at all.
    const first = await asked(sink, read("p1.look", undefined, { ...FIELDS, promo: "div_promo" }), [...range(1, 11), 90, 91, 92, 93].map(withPromo), 1);
    expect(sink.summary().totalRows).toBe(16);
    expect(sink.summary().rows).toEqual(range(1, 16).map(booking));
    expect(first.stored?.rows).toHaveLength(15);
    expect(first.note).toEqual({
      code: "answer_first.result_list_kept",
      rows: 16,
      pages: [{ place: "page=1", kept: 11 }, { place: "page=2", kept: 5 }],
      apart: { rows: 15, pages: [{ place: "page=1", kept: 15 }] },
      missing: expect.arrayContaining(FOUR),
      instruction: expect.stringContaining("the result did not change")
    });
    expect(first.note?.missing).toHaveLength(4);

    // 0250: page 2 the same way joins that look's own list (27 rows), never the result.
    const second = await asked(sink, read("p2.look", undefined, { ...FIELDS, promo: "div_promo" }), range(12, 23).map(withPromo), 2);
    expect(second.note).toMatchObject({ code: "answer_first.result_list_kept", rows: 16, apart: { rows: 27 } });
    expect(sink.summary().totalRows).toBe(16);
    expect(sink.readPages()).toEqual(pagesBefore);
  });

  it("leaves the result for a read with only some of its conditions, and names the ones it lacked", async () => {
    const sink = sinkOver();
    await rightResult(sink);
    const some = await asked(sink, read("p1.two", FOUR.slice(0, 2)), range(1, 12).map(booking), 1);
    expect(some.note).toMatchObject({ code: "answer_first.result_list_kept", rows: 16, apart: { rows: 12 } });
    expect(some.note?.missing).toEqual(expect.arrayContaining(FOUR.slice(2)));
    expect(some.note?.missing).toHaveLength(2);
    expect(sink.summary().totalRows).toBe(16);
  });

  it("does not join the result's own named list when it lacks a condition of it", async () => {
    const sink = sinkOver();
    const named = { datasetId: "bookings" };
    await asked(sink, read("p1.named", FOUR, FIELDS, named), range(1, 11).map(booking), 1);
    await asked(sink, read("p2.named", FOUR, FIELDS, named), range(12, 16).map(booking), 2);
    const loose = await asked(sink, read("p1.named.loose", undefined, FIELDS, named), range(1, 15).map(booking), 1);
    expect(loose.stored?.datasetId).not.toBe(sink.summary().datasetId);
    expect(loose.note).toMatchObject({ code: "answer_first.result_list_kept", rows: 16 });
    expect(sink.summary().totalRows).toBe(16);
  });

  it("leaves a saved Flow's run result as it is, where the run's batches carry the conditions they were read under", async () => {
    const sink = sinkOver();
    const schema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] } as AutomationStudioRecordBatch["schema"];
    const batch = (attemptId: string, rows: JsonObject[], page: number): AutomationStudioRecordBatch => ({
      nodeId: "read", attemptId, batchKey: attemptId, datasetId: "bookings-run", writeMode: "append", schema, rows, invalidCount: 0, truncated: false,
      location: `${HALL}&page=${page}`, leftOut: { extraction: { rejectedSamples: [[], [], [], []] }, parameters: { extractList: { fields: FIELDS, where: FOUR } } }
    });
    await sink.recordBatch(batch("run.1", range(1, 11).map(booking), 1));
    await sink.recordBatch(batch("run.2", range(12, 16).map(booking), 2));
    // The judge said no to the run's rows: a doubted result's rows still stand against a read without its conditions.
    sink.runRowsRefused();
    const look = await asked(sink, read("p1.look", undefined, { ...FIELDS, promo: "div_promo" }), [...range(1, 11), 90, 91, 92, 93].map(withPromo), 1);
    expect(look.note).toMatchObject({ code: "answer_first.result_list_kept", rows: 16, apart: { rows: 15 } });
    expect(sink.summary()).toMatchObject({ datasetId: "bookings-run", totalRows: 16 });
  });

  it("becomes the result only where its record output says writeMode replace, for a condition of the result that was wrong", async () => {
    const sink = sinkOver();
    await rightResult(sink);
    const fixed = await asked(sink, read("p1.fixed", FOUR.slice(0, 3), FIELDS, { datasetId: "bookings.fixed", writeMode: "replace" }), range(1, 13).map(booking), 1);
    expect(fixed.note).toMatchObject({ code: "answer_first.result_list_replaced", rows: 13, replaced: { rows: 16 } });
    expect(sink.summary().totalRows).toBe(13);
  });
});

describe("a read with every condition of the result", () => {
  // Towels run run-mwafor01-bb471f52: page 1 read under three conditions, then page 2 under those and a fourth.
  it("replaces it when it adds a condition, and the model is told", async () => {
    const sink = sinkOver();
    await asked(sink, read("p1.three", FOUR.slice(0, 3)), range(1, 12).map(booking), 1);
    const stricter = await asked(sink, read("p2.four", FOUR), range(13, 17).map(booking), 2);
    expect(stricter.note).toMatchObject({ code: "answer_first.result_list_replaced", rows: 5, pages: [{ place: "page=2", kept: 5 }], replaced: { rows: 12, lastReadBy: "p1.three" } });
    expect(sink.summary().totalRows).toBe(5);
    // Page 1 read under all four then extends it, with nothing to tell.
    const extended = await asked(sink, read("p1.four", FOUR), range(1, 11).map(booking), 1);
    expect(extended.note).toBeUndefined();
    expect(sink.summary().totalRows).toBe(16);
    // And the three-condition list read again no longer takes the result back.
    const older = await asked(sink, read("p1.three.again", FOUR.slice(0, 3)), range(1, 12).map(booking), 1);
    expect(older.note).toMatchObject({ code: "answer_first.result_list_kept", rows: 16, missing: [FOUR[3]] });
    expect(sink.summary().totalRows).toBe(16);
  });

  it("counts the same conditions written in another order as every condition of the result", async () => {
    const sink = sinkOver();
    await asked(sink, read("p1.four", FOUR), range(1, 11).map(booking), 1);
    // Another order of the list is another way of asking, so another list (`../dataset-of-read.ts`), but it lacks no condition: it may be the result, and says so.
    const reordered = FOUR.map((condition) => Object.fromEntries(Object.entries(condition as JsonObject).reverse()) as JsonValue).reverse();
    const again = await asked(sink, read("p1.four.reordered", reordered), range(1, 11).map(booking), 1);
    expect(again.note).toMatchObject({ code: "answer_first.result_list_replaced", rows: 11, replaced: { rows: 11 } });
    expect(sink.summary().totalRows).toBe(11);
  });
});

// Local-classifieds dining tables, run-mwb4bf67-3c240399: the three cheapest were found under three conditions on the search, saved,
// and the last read was of the saved items (another view, a status column, no condition), which is the answer. The rule above held it
// apart and the search's three rows were answered. Only a re-read of the result's own list is held to its conditions (`../row-sink.ts`).
describe("a read of another list than the result's", () => {
  const reserved = (n: number): JsonObject => ({ title: `Booking ${n}`, price: `${n}.00`, status: n % 2 ? "Confirmed" : "Waiting" });

  it("becomes the result when it reads another view with other columns and no condition, and is told as another list", async () => {
    const sink = sinkOver();
    await rightResult(sink);
    const mine = await asked(sink, read("mine", [], { title: "span_title", price: "span_price", status: "span_status" }, { datasetId: "reservations", writeMode: "append" }), [1, 2, 3, 40, 41].map(reserved), MINE);
    expect(mine.note).toMatchObject({ code: "answer_first.result_list_replaced", rows: 5, replaced: { rows: 16 } });
    expect(sink.summary()).toMatchObject({ datasetId: mine.stored?.datasetId, totalRows: 5, rows: [1, 2, 3, 40, 41].map(reserved) });
  });

  it("becomes the result when it reads another view, even with every column of the result", async () => {
    const sink = sinkOver();
    await rightResult(sink);
    const mine = await asked(sink, read("mine.same.columns"), [1, 2, 3].map(booking), MINE);
    expect(mine.note).toMatchObject({ code: "answer_first.result_list_replaced", rows: 3 });
    expect(sink.summary().totalRows).toBe(3);
  });

  it("becomes the result with other columns where no address says which view either read", async () => {
    const sink = sinkOver();
    await asked(sink, read("p1.four.unsaid", FOUR), range(1, 11).map(booking), {});
    const mine = await asked(sink, read("mine.unsaid", undefined, { title: "span_title", status: "span_status" }), [1, 2].map((n) => ({ title: `Booking ${n}`, status: "Confirmed" })), {});
    expect(mine.note).toMatchObject({ code: "answer_first.result_list_replaced", rows: 2 });
    expect(sink.summary().totalRows).toBe(2);
  });
});

describe("a re-read of the result's own list without its conditions is still held apart", () => {
  it("where no address says the view, by every column of the result (towels' look, which added a column)", async () => {
    const sink = sinkOver();
    await asked(sink, read("p1.four.unsaid", FOUR), range(1, 11).map(booking), {});
    const look = await asked(sink, read("p1.look.unsaid", undefined, { ...FIELDS, promo: "div_promo" }), range(1, 15).map(withPromo), {});
    expect(look.note).toMatchObject({ code: "answer_first.result_list_kept", rows: 11, apart: { rows: 15 } });
    expect(sink.summary().totalRows).toBe(11);
  });

  it("at another view, where its record output names the result's list", async () => {
    const sink = sinkOver();
    const named = { datasetId: "bookings" };
    await asked(sink, read("p1.named", FOUR, FIELDS, named), range(1, 11).map(booking), 1);
    const moved = await asked(sink, read("mine.named", undefined, FIELDS, named), range(1, 15).map(booking), MINE);
    expect(moved.note).toMatchObject({ code: "answer_first.result_list_kept", rows: 11 });
    expect(sink.summary().totalRows).toBe(11);
  });

  it("a saved Flow's run named the list, and a look read by that name elsewhere is held to it", async () => {
    const sink = sinkOver();
    const schema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] } as AutomationStudioRecordBatch["schema"];
    await sink.recordBatch({ nodeId: "read", attemptId: "run.1", batchKey: "run.1", datasetId: "bookings-run", writeMode: "append", schema, rows: range(1, 11).map(booking), invalidCount: 0, truncated: false, leftOut: { extraction: { rejectedSamples: [[], [], [], []] }, parameters: { extractList: { fields: FIELDS, where: FOUR } } } });
    const look = await asked(sink, read("mine.run.named", undefined, FIELDS, { datasetId: "bookings-run" }), range(1, 15).map(booking), MINE);
    expect(look.note).toMatchObject({ code: "answer_first.result_list_kept", rows: 11 });
    expect(sink.summary()).toMatchObject({ datasetId: "bookings-run", totalRows: 11 });
  });
});
