import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY } from "../../../../flow-authoring/draft/index.ts";
import { automationStudioLlmSetResultProcessing, automationStudioLlmSetResultProcessingTool, AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID } from "../index.ts";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string" },
    { id: "price", label: "Price", valueType: "string" },
    { id: "badge", label: "Badge", valueType: "string" }
  ]
};
const ROWS: JsonObject[] = [
  { title: "Lamp", price: "$30", badge: "Featured" },
  { title: "Desk", price: "$120" },
  { title: "Chair", price: "$45" },
  { title: "Desk", price: "$120" }
];
const rowsOf = () => ({ datasetId: "result", schema: SCHEMA, rows: ROWS });

describe("core.set_result_processing", () => {
  it("is an observation with a description within Core's bound, naming no page step", () => {
    const tool = automationStudioLlmSetResultProcessingTool();
    expect(tool.toolId).toBe(AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID);
    expect(tool.effect).toBe("observe");
    expect(tool.description.length).toBeLessThanOrEqual(2_000);
    expect(tool.description).toMatch(/touches no page, needs no step and no re-read/u);
    expect(tool.description).toMatch(/Rows a later step acts on are still narrowed by that read's where\./u);
  });

  it("holds the declaration and answers the rows it keeps, what it left out, and every kept row", () => {
    const call = automationStudioLlmSetResultProcessing({
      value: { process: { where: [{ field: "badge", is: "absent" }], sort: [{ field: "price", order: "asc" }], columns: ["title", "price"] } },
      held: undefined,
      rowsOf
    });
    expect(call.held).toEqual({ [AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY]: { where: [{ field: "badge", is: "absent" }], sort: [{ field: "price", order: "asc" }], columns: ["title", "price"] } });
    expect(call.answer.effectApplied).toBe(false);
    expect(call.answer.evidence).toMatchObject({
      ok: true,
      read: 4,
      leftOut: 1,
      repeats: 1,
      kept: 2,
      conditions: [{ condition: "badge is absent", leftOut: 1, leftOutOnlyByThis: ["Lamp"] }],
      rows: [{ title: "Chair", price: "$45" }, { title: "Desk", price: "$120" }]
    });
  });

  it("changes it at any later call, and clears it", () => {
    const first = automationStudioLlmSetResultProcessing({ value: { process: { limit: 1 } }, held: undefined, rowsOf });
    const second = automationStudioLlmSetResultProcessing({ value: { process: { limit: 2 } }, held: first.held, rowsOf });
    expect(second.held).toEqual({ result: { limit: 2 } });
    const cleared = automationStudioLlmSetResultProcessing({ value: { clear: true }, held: second.held, rowsOf });
    expect(cleared.held).toEqual({});
    expect(cleared.answer.evidence).toMatchObject({ ok: true, cleared: true });
  });

  it("refuses a declaration the rows' schema does not take, keeping what was held", () => {
    const held = { result: { limit: 1 } };
    const call = automationStudioLlmSetResultProcessing({ value: { process: { where: [{ field: "colour", is: "present" }] } }, held, rowsOf });
    expect(call.held).toBe(held);
    expect(call.answer.evidence).toMatchObject({ ok: false, code: "result_processing.invalid", issues: ["record_output.process_unknown_field"] });
    expect((call.answer.evidence as JsonObject).said).toMatch(/title, price, badge/u);
    expect(automationStudioLlmSetResultProcessing({ value: {}, held, rowsOf }).answer.evidence).toMatchObject({ ok: false, code: "result_processing.missing" });
  });

  it("holds a declaration made before any row is read, under the list it names", () => {
    const call = automationStudioLlmSetResultProcessing({ value: { process: { limit: 3 }, dataset: "people" }, held: undefined, rowsOf: () => undefined });
    expect(call.held).toEqual({ people: { limit: 3 } });
    expect(call.answer.evidence).toMatchObject({ ok: true, held: true, dataset: "people" });
  });
});
