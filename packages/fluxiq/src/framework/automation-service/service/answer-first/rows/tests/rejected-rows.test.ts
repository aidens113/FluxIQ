// A read whose conditions kept no row may answer with the rows they rejected, and says so in its own
// account (`extraction.conditions.unfiltered`). Those are not its rows (`../found-rows.ts`): live run
// run-mwaf6gnt-638d90a0 read page 2 of a list where nothing met the asked ceiling, and its 20 rejected
// rows became the whole result in place of page 1's 10 right ones (step 0056). A parish hall's bookings,
// no realistic scenario's site.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstReadRows, automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, item, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

const HALL = "http://127.0.0.1:5000/bookings?month=may&sort=date";

/** A live read that kept none of its rows, so answered with the rows its conditions rejected, and said so. */
function rejectedAnswer(rows: JsonValue[], location: string): AutomationStudioLlmEvidenceToolExecutionResult {
  const extraction: JsonObject = { recordCount: rows.length, conditions: { applied: rows.length, kept: 0, rejected: [rows.length], unfiltered: true } };
  return { kind: "llm_evidence_tool_execution", evidence: { location, read: { extracted: rows, extraction } }, effectApplied: false };
}

describe("a read that answered the rows its conditions rejected", () => {
  it("holds no rows, though it answered", () => {
    expect(automationStudioAnswerFirstReadRows(rejectedAnswer([item(1)], HALL), READ_ROWS_KEY)).toEqual([]);
    const kept: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence: { read: { extracted: [item(1)], extraction: { conditions: { unfiltered: false } } } }, effectApplied: false };
    expect(automationStudioAnswerFirstReadRows(kept, READ_ROWS_KEY)).toEqual([item(1)]);
  });

  it("holds no rows when a replayed read's dispatched account says so", () => {
    const replayed: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence: { said: "replayed" }, effectApplied: false, outputs: { records: [item(1)], result: { result: { extraction: { conditions: { unfiltered: true } } } } } };
    expect(automationStudioAnswerFirstReadRows(replayed, READ_ROWS_KEY)).toEqual([]);
  });

  it("stores nothing and leaves the earlier page's rows the result, named otherwise or not", async () => {
    const store = stubStore();
    const sink = automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) });
    await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2)], { location: `${HALL}&page=1` }));
    const many = [3, 4, 5, 6, 7].map(item);
    await sink.fromCall(call("call.2", "web.read", { target: "list", recordOutput: { datasetId: "page_two" } }), rejectedAnswer(many, `${HALL}&page=2`));
    await sink.fromCall(call("call.3"), rejectedAnswer(many, `${HALL}&page=3`));
    expect(store.batches).toHaveLength(1);
    expect(sink.summary()).toMatchObject({ totalRows: 2, rows: [item(1), item(2)] });
    expect(sink.readsAnswered()).toBe(3);
  });
});
