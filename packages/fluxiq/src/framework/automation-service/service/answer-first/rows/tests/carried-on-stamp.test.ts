// A pass of a run that carried the result's list on stamps what the result holds after it (`../row-sink.ts`,
// `../result-change.ts`, run-mwbk0twg): counts only, so the run's note can state the result as it stands. A kind of
// site no realistic scenario is: a cinema's seat map.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioAnswerFirstResultChangeTold, automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, item, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

const HALL = "http://127.0.0.1:5000/seats?screen=2&sort=row";

function sinkOver() {
  const store = stubStore();
  return automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) });
}

describe("a pass of a run that carried the list on", () => {
  it("stamps the rows and reads the result holds after it, and a read that is no pass of a run says nothing", async () => {
    const sink = sinkOver();
    const first = await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2)], { location: `${HALL}&page=1` }));
    expect(first?.resultChanged).toBeUndefined();
    const pass = await sink.fromCall(call("call.2", "web.read", { target: "list", replay: "step" }), liveAnswer([item(3), item(4), item(5)], { location: `${HALL}&page=2` }));
    expect(pass?.resultChanged).toEqual({ kind: "carried_on", now: { rows: 5, pages: [{ where: `${new URL(HALL).origin}/seats?screen=2&sort=row`, place: "page=1", kept: 2 }, { where: `${new URL(HALL).origin}/seats?screen=2&sort=row`, place: "page=2", kept: 3 }] } });
    expect(sink.summary().totalRows).toBe(5);
    const told = automationStudioAnswerFirstResultChangeTold(liveAnswer([]), pass!.resultChanged!);
    expect((told.evidence as JsonObject).resultList).toEqual({ code: "answer_first.result_list_carried_on", rows: 5, pages: [{ place: "page=1", kept: 2 }, { place: "page=2", kept: 3 }] });
    const plain = await sink.fromCall(call("call.3"), liveAnswer([item(6)], { location: `${HALL}&page=3` }));
    expect(plain?.resultChanged).toBeUndefined();
  });
});
