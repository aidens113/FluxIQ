// A condition that leaves out rows having something leaves them out by the
// request's own exclusion words (t660, A8 frozen pair 6 `run-mvac0nmw-52ed30b2`,
// fix 5): the request said to leave a kind of listing out, a presence test left
// out a row on which Core read that very word, and nothing accounted for it, so
// a false claim that the condition "drops qualifying" rows stood and the
// builder dropped a condition the request asks for. A library catalogue, the
// same shape.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultNoRecord } from "../record.ts";
import { automationStudioResultRequestExclusionTest } from "../request-exclusion-test.ts";
import { automationStudioResultRequestTextTest } from "../request-text-test.ts";

const REQUEST = "List every book in the branch catalogue's search results, leaving out reference copies, with columns title and shelf.";
const KEPT = [{ title: "Tides of the Northern Coast", shelf: "Lending A2" }, { title: "A Short History of Lanterns", shelf: "Lending C4" }];
const LEFT_OUT = ["Atlas of River Valleys", "The Lamplighter's Almanac"];

const instruction = (body: string): AutomationStudioFlowInstruction => ({
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
});
const requestText = (body = REQUEST) => `Goal\n${body}`;

/** A read whose one condition alone left out two rows, each settled on the value Core read. */
function summary(condition: string, witnesses: readonly string[] = ["Reference", "Reference desk"]): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: KEPT.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{
      datasetId: "books", recordCount: KEPT.length, refusedCount: 0, truncated: false, columns: ["title", "shelf"], columnsWithheld: false,
      rowsChecked: KEPT.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: KEPT.map((row) => ({ ...row }))
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 4, kept: KEPT.length, paginates: false,
      conditions: [{
        number: 1, condition, rejected: 2, alone: 2,
        leftOutOnlyByThis: LEFT_OUT.map((label, index) => `${label} — shelf: ${witnesses[index]}`),
        leftOutSettled: LEFT_OUT.map((label, index) => `${label} — shelf: ${witnesses[index]}`),
        leftOutObservations: witnesses.map((value, index) => ({ source: "field" as const, page: 1, item: index + 3, state: "present" as const, value }))
      }]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

const says = (body = REQUEST) => automationStudioRequestWording([instruction(body)], summary("shelf not contains [\"Reference\"]"))!.says;
const exclusion = (condition: string, witness: string | undefined, body = REQUEST) => automationStudioResultRequestExclusionTest(condition, witness, requestText(body), says(body));

describe("a presence test that keeps the rows lacking a value", () => {
  it("tests the request's words where the value Core read on the row is what the request leaves out", () => {
    expect(exclusion("reference is absent", "Reference")).toEqual(["reference"]);
    expect(exclusion("reference not is present", "Reference")).toEqual(["reference"]);
    expect(exclusion("the item's text \"Reference\" is absent (a row is kept only when it has no \"Reference\")", "Reference")).toEqual(["reference"]);
  });

  it("tests none where the value read is not the request's, or no value was read", () => {
    expect(exclusion("reference is absent", "Staff pick")).toBeUndefined();
    expect(exclusion("reference is absent", undefined)).toBeUndefined();
  });

  it("tests none where the request asks for those rows, or says the words anywhere but after an exclusion cue", () => {
    expect(exclusion("reference is absent", "Reference", "List every book in the branch catalogue's search results. Include reference copies, with columns title and shelf.")).toBeUndefined();
    expect(exclusion("reference is absent", "Reference", "List every book in the branch catalogue's search results; do not leave out reference copies.")).toBeUndefined();
    expect(exclusion("reference is absent", "Reference", `${REQUEST} Put reference copies first.`)).toBeUndefined();
  });

  it("is read through the text test only with the row's witness", () => {
    expect(automationStudioResultRequestTextTest("reference is absent", requestText(), says(), "Reference")).toEqual(["reference"]);
    expect(automationStudioResultRequestTextTest("reference is absent", requestText(), says())).toBeUndefined();
  });
});

describe("a negated text test", () => {
  it("tests the request's words where its own text is what the request leaves out, whatever the witness", () => {
    expect(exclusion("shelf not contains [\"Reference\"]", undefined)).toEqual(["reference"]);
    expect(automationStudioResultRequestTextTest("shelf not contains [\"Reference\"]", requestText(), says())).toEqual(["reference"]);
    expect(exclusion("shelf not contains [\"Staff pick\"]", undefined)).toBeUndefined();
    expect(exclusion("shelf not matches \"Reference\"", undefined)).toBeUndefined();
  });

  it("accounts for the settled rows it alone left out by the request's words, in Core's record", () => {
    const judged = summary("shelf not contains [\"Reference\"]");
    const record = automationStudioResultNoRecord({ summary: judged, requestText: requestText(), wording: automationStudioRequestWording([instruction(REQUEST)], judged) });
    expect(record.leftOut.map((row) => [row.label, row.quotesRequest, row.quoted?.read])).toEqual([
      [LEFT_OUT[0], true, "Reference"], [LEFT_OUT[1], true, "Reference desk"]
    ]);
    expect(record.conditions?.[0]?.leftOut).toEqual(LEFT_OUT.map((label) => ({ label, accounted: { by: "request_words", texts: ["reference"] } })));
  });

  it("leaves a positive text test of the same words as before: the request excludes them, so it does not ask for them", () => {
    expect(automationStudioResultRequestTextTest("shelf contains [\"Reference\"]", requestText(), says())).toBeUndefined();
  });
});
