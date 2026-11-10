// A saved Flow's run reads one list on two pages: the judge's `readPages` names each page, from the address
// the read's own answer carries (`../../../../../../engine/automation/records/read/location.ts`), through
// the real engine's capture into the real row sink. A parish hall's bookings, no realistic scenario.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { runAutomationStudioGraph, type AutomationStudioRecordBatch } from "../../../../../../engine/automation/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../../../../../../runtime/result-verification/flow-less/index.ts";
import { automationStudioAnswerFirstRowSink } from "../index.ts";
import { READ_ROWS_KEY, stubStore } from "./support.ts";

const HALL = "http://127.0.0.1:5000/bookings?month=may&sort=date";
const RECORD_OUTPUT = {
  datasetId: "bookings",
  recordsPath: "result.extracted",
  writeMode: "append",
  schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string", required: true }, { id: "price", label: "Price", valueType: "number" }] }
};

const readNode = (id: string, parameters: JsonValue = {}) => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: `read-${id}`, parameters, recordOutput: RECORD_OUTPUT } });

/** Each read answers as the web domain does: the action's result holds the rows, the snapshot of the page it read and, where it was asked, its own account. */
const answerOf = (rows: JsonValue[], url: string | undefined, extraction?: JsonValue) => ({ status: "success" as const, route: "success" as const, outputs: { ok: true, result: { result: { extracted: rows, ...(url === undefined ? {} : { snapshot: { url, title: "Bookings" } }), ...(extraction === undefined ? {} : { extraction }) } } } });

/** Each page's rows, as the judge is told them with the page they were read on. */
const FIRST = [{ title: "Item 1", price: 1 }, { title: "Item 2", price: 2 }];
const SECOND = [{ title: "Item 3", price: 3 }, { title: "Item 4", price: 4 }, { title: "Item 5", price: 5 }];

async function runTwoReads(urls: [string | undefined, string | undefined], second: JsonValue[] = SECOND, asked?: { parameters: JsonValue; accounts: [JsonValue, JsonValue] }) {
  const store = stubStore();
  const sink = automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) });
  const batches: AutomationStudioRecordBatch[] = [];
  const answers: Record<string, ReturnType<typeof answerOf>> = {
    "read-first": answerOf(FIRST, urls[0], asked?.accounts[0]),
    "read-second": answerOf(second, urls[1], asked?.accounts[1])
  };
  const trace = await runAutomationStudioGraph({
    schemaVersion: "0.1", flowId: "flow.two-pages", ownerKind: "task", ownerId: "task.two-pages", name: "Two pages", createdAt: 1, updatedAt: 1,
    nodes: [readNode("first", asked?.parameters), readNode("second", asked?.parameters)],
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

// run-mwaudvnh-c208d32c: a saved Flow's replay kept every non-promoted booking and left the promoted copies out, and the
// judge, told what each read kept and never what it left out, took the promoted copy of a kept title for the row twice.
// The page's own account rides the record batch (`engine/automation/records/read/left-out.ts`) into the same `leftOut`
// a read the model made is told with, and on to the judge's copy.
describe("a saved Flow's run read pages, with what their conditions left out", () => {
  const FIELDS = ["title", "price", "promo"];
  const ASKED = { list: { item: ".booking", fields: { title: ".title", price: ".price", promo: ".promo" }, where: [{ field: "promo", is: "absent" }, { field: "price", atMost: 5 }] }, rejectedSamples: "alone" };
  /** A page's account as the web domain sends it: per condition the rows it turned down, the ones it alone turned down first, and what it read on each. */
  const account = (kept: number, alone: [JsonValue[], JsonValue[]], found: [JsonValue[], JsonValue[]]) => ({
    recordCount: kept, pagesRead: 1, truncated: false, fieldNames: FIELDS, missingFields: [],
    conditions: { applied: kept + alone[0].length + alone[1].length, kept, rejected: [alone[0].length, alone[1].length], unfiltered: false },
    rejectedSamples: alone, rejectedSamplesAlone: [alone[0].length, alone[1].length], rejectedObservations: found
  });
  const seen = (conditionIndex: number, item: number, value: string) => ({ conditionIndex, state: "present", source: "field", page: 1, item, value });
  const ACCOUNTS: [JsonValue, JsonValue] = [
    account(2, [[], [{ title: "Item 9", price: "9", promo: null }]], [[], [seen(1, 3, "9")]]),
    // Page 2 shows "Item 1" again, promoted: the copy page 1 kept is the other card.
    account(3, [[{ title: "Item 1", price: "1", promo: "Promoted" }], []], [[seen(0, 1, "Promoted")], []])
  ];

  it("tells each page's left-out rows under the conditions that left them out, as a read the model made is told", async () => {
    const { sink, batches } = await runTwoReads([`${HALL}&page=1`, `${HALL}&page=2`], SECOND, { parameters: ASKED, accounts: ACCOUNTS });
    expect(batches.every((batch) => batch.leftOut !== undefined)).toBe(true);
    const where = ASKED.list.where;
    const columns = ASKED.list.fields;
    expect(sink.readPages().map((page) => page.leftOut)).toEqual([
      { where, columns, found: [undefined, ["9"]], sets: [{ kind: "alone", conditions: [1], rows: [{ title: "Item 9", price: "9" }] }] },
      { where, columns, found: [["Promoted"]], sets: [{ kind: "alone", conditions: [0], rows: [{ title: "Item 1", promo: "Promoted" }] }] }
    ]);
  });

  it("reaches the judge's readPages, and says the left-out label a read also kept is another item", async () => {
    const { sink } = await runTwoReads([`${HALL}&page=1`, `${HALL}&page=2`], SECOND, { parameters: ASKED, accounts: ACCOUNTS });
    const summary = sink.summary();
    const judged = automationStudioFlowLessJudgedSummary({ instructions: "List the bookings at 5 or less, leaving out promoted ones.", acts: [], rows: { totalRows: summary.totalRows, truncated: summary.truncated, columns: summary.columns, rows: summary.rows }, readPages: sink.readPages() }, []);
    const pages = (judged.sent as unknown as { readPages: { keptRows?: string[]; leftOut?: { by: string; rows: string[]; sameLabelKept?: string[] }[] }[] }).readPages;
    const alone = (named: string): string => `${named} by itself, every other condition keeping these rows`;
    expect(pages[0]?.leftOut).toEqual([{ by: alone("condition 2 (price atMost 5; it read \"9\" on the items it left out)"), rows: ["Item 9 — price: 9"] }]);
    expect(pages[1]?.leftOut).toEqual([{ by: alone("condition 1 (promo is absent; it read \"Promoted\" on the items it left out)"), rows: ["Item 1 — promo: Promoted"], sameLabelKept: ["Item 1"] }]);
    expect(pages[0]?.keptRows).toContain("Item 1");
  });
});
