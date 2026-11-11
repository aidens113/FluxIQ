// A saved step's replay is the read it replays (`../row-sink.ts`, run-mwb9b59w-aa0784db). The result was built by a
// read the model made, with no record output. A forward run then sent the same step again as the saved Flow will:
// the call its step keeps (`draft.ranWith`), the record output assembly derives for it, and the replay's own words.
// It was stored as a list of its own and replaced the result as "another list" (`answer_first.result_list_replaced`).
// A kind of site no realistic scenario is: a lending library's catalogue.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstResultChangeTold, automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, liveAnswer, READ_ROWS_KEY, replayedAnswer, stubStore } from "./support.ts";

const SHELF = "http://127.0.0.1:5000/catalogue?topic=maps&sort=year";
const FIELDS = { title: "span_title", year: "span_year", link: "a_href" };
const WHERE = [{ field: "span_year", atLeast: 1900 }];
/** What the read really ran with, as its answer says and its step keeps: what the host added to find the list again. */
const RAN_WITH: JsonObject = { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.1", fields: FIELDS, where: WHERE, minItems: 1, found: { location: SHELF, itemCount: 5 } } }, consequences: [] };
const ASKED: JsonObject = { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.1", fields: FIELDS, where: WHERE, minItems: 1 } }, consequences: [] };

const book = (n: number): JsonObject => ({ title: `Atlas ${n}`, year: `19${10 + n}`, link: `/item/${n}` });
const shown = (row: JsonObject, columns: readonly string[]): JsonObject => Object.fromEntries(columns.map((column) => [column, row[column]!]));

/** The read the model made: its rows, where it read them, and the call its step will keep. */
const handRead = (rows: JsonObject[]): AutomationStudioLlmEvidenceToolExecutionResult => ({ ...liveAnswer(rows, { location: SHELF }), draft: { actionId: "web.output.dom-extract_list", input: ASKED, ranWith: RAN_WITH } });

/** The saved step sent again as a forward run sends it: what it ran with, the record output assembly derives, and the replay's words. */
function replayCall(callId: string, columns: readonly string[], ranWith: JsonObject = RAN_WITH) {
  const recordOutput = { label: "Read the atlases", datasetId: "web-output-dom-extract-list-d10", schema: { schemaVersion: "0.1", fields: columns.map((id) => ({ id, label: id, valueType: "string" })) }, writeMode: "append" };
  return call(callId, "core.run_node", { ...ranWith, parameters: { ...(ranWith.parameters as JsonObject), recordOutput }, replay: "step", from: { location: SHELF }, produced: { records: 3 } });
}

function sinkOver(instructionText?: string) {
  const store = stubStore();
  const sink = automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch), ...(instructionText ? { instructionText } : {}) });
  return { sink, store };
}

/** One call through the sink, with the note the model would read on its answer. */
async function through(sink: ReturnType<typeof sinkOver>["sink"], asked: ReturnType<typeof call>, answer: AutomationStudioLlmEvidenceToolExecutionResult) {
  const stored = await sink.fromCall(asked, answer);
  const told = stored?.resultChanged ? automationStudioAnswerFirstResultChangeTold(answer, stored.resultChanged) : answer;
  return { stored, note: (told.evidence as JsonObject).resultList };
}

describe("a forward run's replay of the read that built the result", () => {
  it("is the same list, with every column the read returned: no list of its own, no note", async () => {
    const { sink, store } = sinkOver();
    const rows = [1, 2, 3].map(book);
    const first = await through(sink, call("read-atlases", "core.run_node", ASKED), handRead(rows));
    const again = await through(sink, replayCall("forward.10", ["title", "year", "link"]), replayedAnswer(rows));
    expect(again.stored?.datasetId).toBe(first.stored?.datasetId);
    expect(again.stored?.resultChanged).toBeUndefined();
    expect(again.note).toBeUndefined();
    expect(sink.summary()).toMatchObject({ datasetId: first.stored?.datasetId, totalRows: 3 });
    expect(new Set(store.batches.map((batch) => batch.datasetId)).size).toBe(1);
  });

  it("is the same list when it returns only the columns the person named, and its rows take the read's places", async () => {
    const { sink, store } = sinkOver("Give me a table of the atlases with columns title and year.");
    const rows = [1, 2, 3].map(book);
    const first = await through(sink, call("read-atlases", "core.run_node", ASKED), handRead(rows));
    const narrowed = rows.map((row) => shown(row, ["title", "year"]));
    const again = await through(sink, replayCall("forward.10", ["title", "year"]), replayedAnswer(narrowed));
    expect(again.stored?.datasetId).toBe(first.stored?.datasetId);
    expect(again.note).toBeUndefined();
    const summary = sink.summary();
    expect(summary).toMatchObject({ datasetId: first.stored?.datasetId, totalRows: 3 });
    expect(summary.columns.map((column) => column.id)).toEqual(["title", "year"]);
    expect(summary.rows.map((row) => row.title)).toEqual(["Atlas 1", "Atlas 2", "Atlas 3"]);
    expect(new Set(store.batches.map((batch) => batch.datasetId)).size).toBe(1);
  });

  it("keeps a replay of a step no read of this exploration made a list of its own, as before", async () => {
    const { sink } = sinkOver();
    const rows = [1, 2, 3].map(book);
    const first = await through(sink, call("read-atlases", "core.run_node", ASKED), handRead(rows));
    const other: JsonObject = { ...RAN_WITH, parameters: { extractList: { handle: "extraction.2", fields: FIELDS, minItems: 1 } } };
    const again = await through(sink, replayCall("forward.4", ["title", "year", "link"], other), replayedAnswer([4, 5].map(book)));
    expect(again.stored?.datasetId).not.toBe(first.stored?.datasetId);
  });
});
