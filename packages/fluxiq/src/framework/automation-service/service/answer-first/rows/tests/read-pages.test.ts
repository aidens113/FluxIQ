// Which pages a result's rows were read from (`../sink-type.ts`, `readPages`): one entry per read, with where it
// read, how many rows it kept and which, none while no read stored a row. A kind of site no realistic scenario is: a parish
// hall's bookings.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, item, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

function sinkOver() {
  const store = stubStore();
  return automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) });
}

const HALL = "http://127.0.0.1:5000/bookings?month=may&sort=date";

describe("automationStudioAnswerFirstRowSink readPages", () => {
  it("names each page two reads read and how many rows each kept", async () => {
    const sink = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2)], { location: `${HALL}&page=1` }));
    await sink.fromCall(call("call.2"), liveAnswer([item(3), item(4), item(5)], { location: `${HALL}&page=2` }));
    expect(sink.readPages()).toEqual([
      { where: `${new URL(HALL).origin}/bookings?month=may&sort=date`, place: "page=1", kept: 2, rows: [item(1), item(2)] },
      { where: `${new URL(HALL).origin}/bookings?month=may&sort=date`, place: "page=2", kept: 3, rows: [item(3), item(4), item(5)] }
    ]);
  });

  // run-mwaf6gnt-638d90a0 (steps 0039, 0049): page 2 held nothing the conditions keep, so it stored no row
  // and was told nowhere, and two judges said unknown because "only page 1 was read".
  it("names a further page of the same read that kept no row, with kept 0, and changes no row", async () => {
    const sink = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2)], { location: `${HALL}&page=1` }));
    await sink.fromCall(call("call.2"), liveAnswer([], { location: `${HALL}&page=2` }));
    await sink.fromCall(call("call.3"), liveAnswer([], { location: `${HALL}&page=2` }));
    const where = `${new URL(HALL).origin}/bookings?month=may&sort=date`;
    expect(sink.readPages()).toEqual([{ where, place: "page=1", kept: 2, rows: [item(1), item(2)] }, { where, place: "page=2", kept: 0 }]);
    expect(sink.summary()).toMatchObject({ totalRows: 2, rows: [item(1), item(2)] });
  });

  it("does not name an empty read asked another way, named otherwise, of another view, or with no place", async () => {
    const sink = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2)], { location: `${HALL}&page=1` }));
    await sink.fromCall(call("call.2", "web.read", { target: "other list" }), liveAnswer([], { location: `${HALL}&page=2` }));
    await sink.fromCall(call("call.3", "web.read", { target: "list", recordOutput: { datasetId: "spare" } }), liveAnswer([], { location: `${HALL}&page=3` }));
    await sink.fromCall(call("call.4"), liveAnswer([], { location: "http://127.0.0.1:5000/bookings?month=june&sort=date&page=2" }));
    await sink.fromCall(call("call.5"), liveAnswer([], { location: HALL }));
    expect(sink.readPages()).toEqual([{ where: `${new URL(HALL).origin}/bookings?month=may&sort=date`, place: "page=1", kept: 2, rows: [item(1), item(2)] }]);
  });

  it("carries the list on when a page told empty is read again with rows, in that page's place", async () => {
    const sink = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2)], { location: `${HALL}&page=1` }));
    await sink.fromCall(call("call.2"), liveAnswer([], { location: `${HALL}&page=2` }));
    await sink.fromCall(call("call.3"), liveAnswer([item(3), item(4), item(5)], { location: `${HALL}&page=2` }));
    const where = `${new URL(HALL).origin}/bookings?month=may&sort=date`;
    expect(sink.readPages()).toEqual([{ where, place: "page=1", kept: 2, rows: [item(1), item(2)] }, { where, place: "page=2", kept: 3, rows: [item(3), item(4), item(5)] }]);
    expect(sink.summary().rows.map((row) => row.price)).toEqual([1, 2, 3, 4, 5]);
  });

  it("is empty while no read stored a row", async () => {
    const sink = sinkOver();
    expect(sink.readPages()).toEqual([]);
    await sink.fromCall(call("call.1"), liveAnswer([], { location: HALL }));
    expect(sink.readPages()).toEqual([]);
  });
});
