// The feed tells the data stage what each page's own read captured (t993): a tag only some items carry is a definite
// "not shown" on the rest, while a page whose read never captured the field still withholds the answer, naming it.
import { expect, it } from "vitest";
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, validateAutomationStudioRecords, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automaticFeed, SCHEMA } from "./automatic-support.ts";

const TAGGED: AutomationStudioRecordSchema = { ...SCHEMA, fields: [...SCHEMA.fields, { id: "tag", label: "Tag", valueType: "string" }] };
const DECLARED = { where: [{ field: "Tag", contains: "Renewable" }], columns: ["Title"] };

it("reads a captured tag the item does not show as a definite no, and the answer is ready", () => {
  const p = automaticFeed(DECLARED);
  p.read("one", [{ id: "a", title: "Atlas", tag: "Renewable" }, { id: "b", title: "Birds" }, { id: "c", title: "Clocks", tag: "" }], TAGGED);
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.rows().rows.map((row) => row.title)).toEqual(["Atlas"]);
  expect(p.feed.evidence().processing).toMatchObject({ collected: 3, leftOut: 2, kept: 1 });
});

it("withholds the answer for a page whose own read never captured the field, naming that page", () => {
  const p = automaticFeed(DECLARED);
  // One read asked the same way on two pages, as the same step: the first page's retained schema lacked the tag (read
  // before the schema grew), the second's has it.
  const fields = Object.fromEntries(TAGGED.fields.filter((field) => field.handling !== "exclude").map((field) => [field.id, `.${field.id}`]));
  const read = (source: string, rows: JsonObject[], schema: AutomationStudioRecordSchema, place: string) => {
    const checked = validateAutomationStudioRecords(rows, schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
    const value: JsonObject = { node: "fixture.read", parameters: { read: { fields } } };
    const step: AutomationStudioFlowDraftStep = { id: source, callId: source, position: p.steps.length + 1, iteration: p.steps.length + 1, disposition: "kept", proposes: true, effect: "observe", input: value, toolId: "core.run_node", actionId: "fixture.read" };
    p.steps.push(step);
    const stored = { ...schema, fields: schema.fields.filter((field) => field.handling !== "exclude") };
    p.feed.expect({ kind: "add", position: step.position, intermediate: false });
    p.feed.called({ callId: source, toolId: "core.run_node", value }, { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { read: { extracted: checked.rows, listKey: "fixture.records", place } } }, { rows: checked.rows, schema: stored, datasetId: `read.${source}`, invalidCount: checked.invalidCount, truncated: checked.truncated });
    p.feed.draft(p.steps);
  };
  read("early", [{ id: "a", title: "Atlas" }], SCHEMA, "page=1");
  read("late", [{ id: "b", title: "Birds", tag: "Renewable" }, { id: "c", title: "Clocks" }], TAGGED, "page=2");
  expect(p.feed.evidence().pages.map((page) => page.source)).toEqual(["early", "late"]);
  const readiness = p.feed.readiness();
  expect(readiness).toMatchObject({ state: "missing-evidence", code: "answer_first.processing_evidence_missing", reason: expect.stringContaining("where[0] tag (missing) at source early") });
  expect(readiness).toMatchObject({ reason: expect.not.stringContaining("at source late") });
});
