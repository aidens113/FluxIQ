// How a read changed the result, as the sink tells it (`../row-sink.ts`, `resultChanged`), and the note the
// read's answer then carries (`../result-change.ts`). Live run run-mwafor01-bb471f52 (step 0094): a read asked
// another way made one page the whole result in place of a two-page list, and the model was never told. A kind
// of site no realistic scenario is: a parish hall's bookings.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultChangeTold, automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, item, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

function sinkOver() {
  const store = stubStore();
  return automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) });
}

const HALL = "http://127.0.0.1:5000/bookings?month=may&sort=date";
const WHERE = `${new URL(HALL).origin}/bookings?month=may&sort=date`;
const at = (page: number) => ({ location: `${HALL}&page=${page}` });

describe("automationStudioAnswerFirstRowSink resultChanged", () => {
  it("says a read asked another way made the result its own list, with the list it replaced", async () => {
    const sink = sinkOver();
    expect((await sink.fromCall(call("call.1", "web.read", { where: "three" }), liveAnswer([item(1), item(2)], at(1))))?.resultChanged).toBeUndefined();
    // A further page of the same list carries it on: nothing to tell.
    expect((await sink.fromCall(call("call.2", "web.read", { where: "three" }), liveAnswer([item(3)], at(2))))?.resultChanged).toBeUndefined();
    const stored = await sink.fromCall(call("call.3", "web.read", { where: "four" }), liveAnswer([item(3)], at(2)));
    expect(stored?.resultChanged).toEqual({
      kind: "other_list",
      now: { rows: 1, pages: [{ where: WHERE, place: "page=2", kept: 1 }] },
      before: { rows: 3, columns: ["title", "price"], pages: [{ where: WHERE, place: "page=1", kept: 2 }, { where: WHERE, place: "page=2", kept: 1 }], lastReadBy: "call.2" }
    });
    expect(sink.summary().totalRows).toBe(1);
  });

  it("says a start-over that left out a row the list held, and not one that read every row again", async () => {
    const sink = sinkOver();
    const named = (writeMode?: string) => ({ recordOutput: { datasetId: "bookings", ...(writeMode ? { writeMode } : {}) } });
    await sink.fromCall(call("call.1", "web.read", named()), liveAnswer([item(1), item(2)]));
    // Every row again, and one more, out of the list's order: over, and nothing lost.
    expect((await sink.fromCall(call("call.2", "web.read", named("replace")), liveAnswer([item(2), item(1), item(3)])))?.resultChanged).toBeUndefined();
    const filtered = await sink.fromCall(call("call.3", "web.read", named("replace")), liveAnswer([item(3)]));
    expect(filtered?.resultChanged).toMatchObject({ kind: "started_over", now: { rows: 1 }, before: { rows: 3, lastReadBy: "call.2" } });
  });

  it("tells nothing when the list that goes was a working one, or when the read leaves the result where it was", async () => {
    const sink = sinkOver();
    await sink.fromCall(call("call.1", "web.read", { recordOutput: { datasetId: "rooms", purpose: "intermediate" } }), liveAnswer([item(1), item(2)]));
    expect((await sink.fromCall(call("call.2", "web.read", { where: "bookings" }), liveAnswer([item(3)])))?.resultChanged).toBeUndefined();
    // A working read after the answer is not the result, so it changed nothing.
    expect((await sink.fromCall(call("call.3", "web.read", { recordOutput: { datasetId: "halls", purpose: "intermediate" } }), liveAnswer([item(4), item(5)])))?.resultChanged).toBeUndefined();
    expect(sink.summary().rows).toEqual([item(3)]);
  });
});

describe("automationStudioAnswerFirstResultChangeTold", () => {
  const change = { kind: "other_list" as const, now: { rows: 1, pages: [{ where: WHERE, place: "page=2", kept: 1 }] }, before: { rows: 3, columns: ["title"], pages: [{ where: WHERE, kept: 3 }], lastReadBy: "call.2" } };

  it("puts Core's note beside what the domain answered, without the view's address, and changes nothing else", () => {
    const answer = liveAnswer([item(3)], at(2));
    const told = automationStudioAnswerFirstResultChangeTold(answer, change);
    expect(told).toEqual({ ...answer, evidence: { ...(answer.evidence as object), resultList: {
      code: "answer_first.result_list_replaced", rows: 1, pages: [{ place: "page=2", kept: 1 }],
      replaced: { rows: 3, columns: ["title"], pages: [{ kept: 3 }], lastReadBy: "call.2" },
      instruction: expect.stringContaining("only this list's rows are in it")
    } } });
    expect(answer.evidence).not.toHaveProperty("resultList");
  });

  it("keeps an answer whose evidence is not an object whole, beside the note", () => {
    const told = automationStudioAnswerFirstResultChangeTold({ kind: "llm_evidence_tool_execution", evidence: ["as answered"], effectApplied: false }, { ...change, kind: "started_over" });
    expect(told.evidence).toMatchObject({ answered: ["as answered"], resultList: { code: "answer_first.result_list_started_over" } });
  });
});
