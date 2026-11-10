// What each read's own conditions left out stays with the page it read and reaches the judge
// (`../read-evidence.ts` `leftOut`, `../row-sink.ts` `readPages`). Run-mwaknxf9-7549d126: a site listed one product
// as a promoted card and again as an ordinary one; the judge, shown rows by name and pages by count, took
// the ordinary card a name condition dropped for the promoted card correctly left out, and passed a list
// one row short. A kind of site no realistic scenario is: a library's catalogue.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstReadEvidenceOf, automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

const SHELF = "http://127.0.0.1:5000/catalogue?topic=maps&sort=newest";
const COLUMNS = { title: "title_text", price: "price_text" };
/** No promoted badge, and (the model's own addition) not the book named. */
const WHERE = [{ field: "promo_badge", is: "absent" }, { field: "title_text", matches: "Atlas of Rivers", not: true }];
const KEPT = [{ title: "Garden Birds", price: "$9" }, { title: "Night Sky", price: "$11" }];

/** The call that asked for the read, as an exploring read's call carries it. */
const asked = (callId: string, page = 1) => call(callId, "core.run_node", { node: "lists.read", parameters: { page, read: { fields: COLUMNS, where: WHERE } } });

/** The exploring read's answer: its kept rows, and beside them what its conditions turned down, as the web domain writes it. */
function explored(): ReturnType<typeof liveAnswer> {
  const answer = liveAnswer(KEPT, { location: `${SHELF}&page=1` });
  const read = (answer.evidence as JsonObject).read as JsonObject;
  read.rejectedRows = {
    fields: ["title", "price"],
    conditions: [{ where: 0, rejected: 1, alone: 0 }, { where: 1, rejected: 2, alone: 1, rowsAlone: [["Atlas of Rivers", "$12"]] }],
    rowsWithOthers: [{ failed: [0, 1], rows: [["Atlas of Rivers", "$12"]] }]
  };
  read.extraction = {
    recordCount: 2,
    pagesRead: 1,
    rejectedObservations: [
      [{ conditionIndex: 0, state: "present", value: "Promoted" }],
      [{ conditionIndex: 1, state: "present", value: "Atlas of Rivers" }, { conditionIndex: 1, state: "present", value: "Atlas of Rivers" }]
    ]
  };
  return answer;
}

function sinkOver() {
  const store = stubStore();
  return automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) });
}

describe("what a read's own conditions left out", () => {
  it("keeps an exploring read's left-out rows with the page it read, under the conditions that left them out", async () => {
    const sink = sinkOver();
    await sink.fromCall(asked("call.1"), explored());
    const [page] = sink.readPages();
    expect(page).toMatchObject({ place: "page=1", kept: 2, rows: KEPT });
    expect(page!.leftOut).toEqual({
      where: WHERE,
      columns: COLUMNS,
      found: [["Promoted"], ["Atlas of Rivers"]],
      sets: [
        { kind: "alone", conditions: [1], rows: [{ title: "Atlas of Rivers" }] },
        { kind: "together", conditions: [0, 1], rows: [{ title: "Atlas of Rivers" }] }
      ]
    });
  });

  it("reads a replayed read's readRows, Core's own contract, at the answer's top", () => {
    const answer = { kind: "llm_evidence_tool_execution" as const, effectApplied: false, outputs: { records: KEPT }, evidence: { said: "replayed", readRows: {
      rows: KEPT.map(({ title }) => ({ title })),
      leftOutOnlyByThis: [{ condition: "promo_badge", conditionIndex: 0, rows: [{ title: "Atlas of Rivers" }], observations: [{ conditionIndex: 0, state: "present", value: "Promoted" }] }],
      leftOutTogether: [{ conditions: ["price_text", "title_text"], conditionIndexes: [1, 2], rows: [{ title: "Pocket Atlas" }] }]
    } } };
    expect(automationStudioAnswerFirstReadEvidenceOf(asked("call.2"), answer, READ_ROWS_KEY).leftOut).toEqual({
      where: WHERE,
      columns: COLUMNS,
      found: [["Promoted"]],
      sets: [
        { kind: "alone", conditions: [0], rows: [{ title: "Atlas of Rivers" }] },
        { kind: "together", conditions: [1, 2], rows: [{ title: "Pocket Atlas" }] }
      ]
    });
  });

  it("says nothing for a read whose answer names no left-out row", () => {
    expect(automationStudioAnswerFirstReadEvidenceOf(asked("call.3"), liveAnswer(KEPT), READ_ROWS_KEY)).not.toHaveProperty("leftOut");
  });

  it("shows the judge, per read, the rows it kept and the ordinary card a name condition left out by itself", async () => {
    const sink = sinkOver();
    await sink.fromCall(asked("call.1"), explored());
    const summary = sink.summary();
    const sent = automationStudioFlowLessJudgedSummary({
      instructions: "List the map books, leaving out promoted listings.",
      acts: [],
      rows: { totalRows: summary.totalRows, truncated: summary.truncated, columns: summary.columns, rows: summary.rows },
      readPages: sink.readPages()
    }, []).sent as unknown as { readPages: { keptRows?: string[]; leftOut?: { by: string; rows: string[] }[] }[] };
    expect(sent.readPages[0]!.keptRows).toEqual(["Garden Birds", "Night Sky"]);
    expect(sent.readPages[0]!.leftOut).toEqual([
      { by: "condition 2 (title not matches \"Atlas of Rivers\"; it read \"Atlas of Rivers\" on the items it left out) by itself, every other condition keeping these rows", rows: ["Atlas of Rivers"] },
      { by: "condition 1 (promo_badge is absent; it read \"Promoted\" on the items it left out) and condition 2 (title not matches \"Atlas of Rivers\"; it read \"Atlas of Rivers\" on the items it left out) together, each of which left these rows out", rows: ["Atlas of Rivers"] }
    ]);
  });
});
