// Which pages a result's rows were read from (`../sink-type.ts`, `readPages`): one entry per read, with where it
// read and how many rows it kept, none while no read stored a row. A kind of site no realistic scenario is: a parish
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
      { where: `${new URL(HALL).origin}/bookings?month=may&sort=date`, place: "page=1", kept: 2 },
      { where: `${new URL(HALL).origin}/bookings?month=may&sort=date`, place: "page=2", kept: 3 }
    ]);
  });

  it("is empty while no read stored a row", async () => {
    const sink = sinkOver();
    expect(sink.readPages()).toEqual([]);
    await sink.fromCall(call("call.1"), liveAnswer([], { location: HALL }));
    expect(sink.readPages()).toEqual([]);
  });
});
