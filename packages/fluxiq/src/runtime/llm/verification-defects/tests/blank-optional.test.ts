// A judge's no whose act defect wrote a blank column is read, not refused unread (t1034). The shape is the no of the
// bigbox run run-mwveg5ls-0266dfe0 (step 234), key for key, with made-up rows and words: eight defects, one of them an
// act's with `column: ""` beside its value. That one entry made the whole current no malformed, and the judge was asked
// again at the price of a second whole judgement.
import { describe, expect, it } from "vitest";
import { parseAutomationStudioLlmProviderResult } from "../../harness/index.ts";
import { automationStudioLlmWellFormedVerificationDefects } from "../index.ts";

const ACT = { kind: "act_wrong", row: "Paper cups, 50 count", column: "", value: "added to basket", step: "add to basket act", requestWords: "Add one of that item to my basket" };
const ROW = { kind: "wrong_value", row: "Paper cups, 50 count", column: "delivery", value: "Delivery today", step: "read.search.3", requestWords: "ready for delivery today" };

const no = (defects: unknown[]) => ({
  response: { kind: "diagnosis", summary: "Not confirmed.", diagnosis: { answersRequest: "no", observed: "The basket was changed.", defects } },
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
});

describe("a defect's optional text written blank", () => {
  it("is read as not written, and an act's value needs no column", () => {
    const read = automationStudioLlmWellFormedVerificationDefects([ROW, ACT]);
    expect(read.dropped).toEqual([]);
    expect(read.kept[1]).toEqual({ kind: "act_wrong", row: ACT.row, value: ACT.value, step: ACT.step, requestWords: ACT.requestWords });
    expect(automationStudioLlmWellFormedVerificationDefects([{ ...ACT, kind: "act_missing", step: " " }]).kept[0]).toEqual({ kind: "act_missing", row: ACT.row, value: ACT.value, requestWords: ACT.requestWords });
  });

  it("still drops a row's value with no column, and an act_wrong with no step", () => {
    expect(automationStudioLlmWellFormedVerificationDefects([{ ...ROW, column: "" }]).dropped).toEqual([0]);
    expect(automationStudioLlmWellFormedVerificationDefects([{ ...ACT, step: "" }]).dropped).toEqual([0]);
    expect(automationStudioLlmWellFormedVerificationDefects([{ ...ACT, requestWords: "" }]).dropped).toEqual([0]);
  });

  it("lets a current no that lists it be read, with every defect it gave", () => {
    const result = parseAutomationStudioLlmProviderResult(no([ROW, ACT]), "diagnosis", undefined, undefined, true);
    expect(result.diagnostics.filter((one) => one.severity === "error")).toEqual([]);
    expect((result.response as { diagnosis: { defects: unknown[] } }).diagnosis.defects).toHaveLength(2);
  });

  it("still refuses a current no whose account holds a malformed defect", () => {
    const result = parseAutomationStudioLlmProviderResult(no([ROW, { ...ROW, column: "", value: "x" }]), "diagnosis", undefined, undefined, true);
    expect(result.diagnostics.map((one) => one.code)).toContain("llm_output.verification_defects_required");
  });
});
