// A saved Flow's run reads one list on two pages: the judge's `readPages` names each page, from the address
// the read's own answer carries (`../../../../../../engine/automation/records/read-location.ts`), through
// the real engine's capture into the real row sink. A parish hall's bookings, no realistic scenario.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { runAutomationStudioGraph, type AutomationStudioRecordBatch } from "../../../../../../engine/automation/index.ts";
import { automationStudioAnswerFirstRowSink } from "../index.ts";
import { READ_ROWS_KEY, stubStore } from "./support.ts";

const HALL = "http://127.0.0.1:5000/bookings?month=may&sort=date";
const RECORD_OUTPUT = {
  datasetId: "bookings",
  recordsPath: "result.extracted",
  writeMode: "append",
  schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string", required: true }, { id: "price", label: "Price", valueType: "number" }] }
};

const readNode = (id: string) => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: `read-${id}`, parameters: {}, recordOutput: RECORD_OUTPUT } });

/** Each read answers as the web domain does: the action's result holds the rows and the snapshot of the page it read. */
const answerOf = (rows: JsonValue[], url: string | undefined) => ({ status: "success" as const, route: "success" as const, outputs: { ok: true, result: { result: { extracted: rows, ...(url === undefined ? {} : { snapshot: { url, title: "Bookings" } }) } } } });

/** Each page's rows, as the judge is told them with the page they were read on. */
const FIRST = [{ title: "Item 1", price: 1 }, { title: "Item 2", price: 2 }];
const SECOND = [{ title: "Item 3", price: 3 }, { title: "Item 4", price: 4 }, { title: "Item 5", price: 5 }];

async function runTwoReads(urls: [string | undefined, string | undefined], second: JsonValue[] = SECOND) {
  const store = stubStore();
  const sink = automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) });
  const batches: AutomationStudioRecordBatch[] = [];
  const answers: Record<string, ReturnType<typeof answerOf>> = {
    "read-first": answerOf(FIRST, urls[0]),
    "read-second": answerOf(second, urls[1])
  };
  const trace = await runAutomationStudioGraph({
    schemaVersion: "0.1", flowId: "flow.two-pages", ownerKind: "task", ownerId: "task.two-pages", name: "Two pages", createdAt: 1, updatedAt: 1,
    nodes: [readNode("first"), readNode("second")],
    edges: [{ id: "first.second", sourceNodeId: "first", targetNodeId: "second", sourcePortId: "success" }]
  } as Parameters<typeof runAutomationStudioGraph>[0], {
    effectDispatcher: (effect) => answers[String((effect.payload as { outputId?: unknown } | undefined)?.outputId)] ?? { status: "failed", route: "failed" },
    onRecordBatch: async (batch) => {
      batches.push(batch);
      return sink.recordBatch(batch);
    }
  });
  return { sink, batches, trace };
}

describe("a saved Flow's run read pages", () => {
  it("names the page each of its two reads read, with its place, as the judge is told", async () => {
    const { sink, batches, trace } = await runTwoReads([`${HALL}&page=1`, `${HALL}&page=2`]);
    expect(trace.status).toBe("succeeded");
    expect(batches.map((batch) => batch.location)).toEqual([`${HALL}&page=1`, `${HALL}&page=2`]);
    const where = `${new URL(HALL).origin}/bookings?month=may&sort=date`;
    expect(sink.readPages()).toEqual([{ where, place: "page=1", kept: 2, rows: FIRST }, { where, place: "page=2", kept: 3, rows: SECOND }]);
  });

  // run-mwaf6gnt-638d90a0: a later page that held nothing the read keeps was told nowhere, and two judges said unknown.
  it("names a later page that kept no row, with kept 0, and holds the first page's rows alone", async () => {
    const { sink, batches } = await runTwoReads([`${HALL}&page=1`, `${HALL}&page=2`], []);
    expect(batches.map((batch) => batch.rows.length)).toEqual([2, 0]);
    const where = `${new URL(HALL).origin}/bookings?month=may&sort=date`;
    expect(sink.readPages()).toEqual([{ where, place: "page=1", kept: 2, rows: FIRST }, { where, place: "page=2", kept: 0 }]);
    expect(sink.summary().totalRows).toBe(2);
  });

  it("says no address where the read's answer carried none, and still counts the rows kept", async () => {
    const { sink, batches } = await runTwoReads([undefined, undefined]);
    expect(batches.every((batch) => batch.location === undefined)).toBe(true);
    expect(sink.readPages()).toEqual([{ kept: 2, rows: FIRST }, { kept: 3, rows: SECOND }]);
  });
});
