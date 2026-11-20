import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstReadEvidenceOf } from "../../rows/index.ts";
import { resultPipeline } from "./pipeline.ts";

const FIELDS = { title: "title_text", price: "price_text" };
const WHERE = [{ field: "promoted", is: "absent" }, { field: "title_text", matches: "Atlas of Rivers", not: true }];
const KEPT = [{ title: "Garden Birds", price: "$9" }, { title: "Night Sky", price: "$11" }];
const READ: JsonObject = {
  rejectedRows: { fields: ["title", "price"], conditions: [{ where: 0, rejected: 1, alone: 0 }, { where: 1, rejected: 2, alone: 1, rowsAlone: [["Atlas of Rivers", "$12"]] }], rowsWithOthers: [{ failed: [0, 1], rows: [["Atlas of Rivers", "$12"]] }] },
  extraction: { recordCount: 2, pagesRead: 1, rejectedObservations: [[{ conditionIndex: 0, state: "present", value: "Promoted" }], [{ conditionIndex: 1, state: "present", value: "Atlas of Rivers" }]] }
};

describe("the conditions' left-out rows on their contributing ledger page", () => {
  it("keeps exploring exclusions and their observations apart from the answer rows through the judge", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.one", value: p.input(WHERE, FIELDS), place: "page=1", rows: KEPT, extra: READ });
    const page = p.feed.evidence().pages[0];
    expect(page).toMatchObject({ place: "page=1", kept: 2, rows: KEPT });
    expect(page?.leftOut).toEqual({ where: WHERE, columns: FIELDS, found: [["Promoted"], ["Atlas of Rivers"]], sets: [
      { kind: "alone", conditions: [1], rows: [{ title: "Atlas of Rivers" }] },
      { kind: "together", conditions: [0, 1], rows: [{ title: "Atlas of Rivers" }] }
    ] });
    const sent = automationStudioFlowLessJudgedSummary({ instructions: "Give columns title and price.", acts: [], rows: p.feed.rows(), readPages: p.feed.readPages(), resultEvidence: p.feed.evidence() }, []).sent;
    expect(sent.resultEvidence?.pages).toEqual(p.feed.evidence().pages);
    expect(p.feed.rows().rows).toEqual(KEPT);
    expect(JSON.stringify(sent)).toContain("by itself, every other condition keeping these rows");
  });

  it("reads replay exclusions from the producer's top-level readRows contract", () => {
    const value = { parameters: { read: { fields: FIELDS, where: WHERE } } };
    const evidence = { readRows: { leftOutOnlyByThis: [{ conditionIndex: 0, rows: [{ title: "Atlas of Rivers" }], observations: [{ state: "present", value: "Promoted" }] }], leftOutTogether: [{ conditionIndexes: [0, 1], rows: [{ title: "Pocket Atlas" }] }] } };
    const read = automationStudioAnswerFirstReadEvidenceOf({ callId: "replay", toolId: "core.run_node", value }, { kind: "llm_evidence_tool_execution", effectApplied: false, outputs: { records: KEPT }, evidence }, "read.extracted");
    expect(read.leftOut).toEqual({ where: WHERE, columns: FIELDS, found: [["Promoted"]], sets: [{ kind: "alone", conditions: [0], rows: [{ title: "Atlas of Rivers" }] }, { kind: "together", conditions: [0, 1], rows: [{ title: "Pocket Atlas" }] }] });
  });

  it("does not invent left-out rows when the producer supplies none", () => {
    expect(automationStudioAnswerFirstReadEvidenceOf({ callId: "read", toolId: "read", value: {} }, { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { read: { extracted: KEPT } } }, "read.extracted")).not.toHaveProperty("leftOut");
  });
});
