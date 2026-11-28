import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, validateAutomationStudioRecords, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstTaskProcessing } from "../../result-processing/index.ts";
import { automationStudioAnswerFirstResultFeed } from "../index.ts";

export const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", primaryKey: ["id"], fields: [
  { id: "id", label: "Id", valueType: "string", semanticType: "id" },
  { id: "title", label: "Title", valueType: "string", required: true },
  { id: "price", label: "Price", valueType: "string", semanticType: "currency" },
  { id: "promoted", label: "Promoted", valueType: "boolean", semanticType: "flag", mark: "badge" },
  { id: "date", label: "Date", valueType: "string", semanticType: "date" },
  { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }
] };
export const REFERENCE = Date.UTC(2030, 0, 10, 12);

export function automaticFeed(process: JsonValue | undefined = {}, reference: number | null = REFERENCE, instructionText = "List the matching records.", inputs?: Record<string, JsonValue>) {
  const processing = automationStudioAnswerFirstTaskProcessing({ instructionText, declared: process === undefined ? {} : { process }, kept: undefined, legacy: false })!;
  const feed = automationStudioAnswerFirstResultFeed({ instructionText, readRowsKey: "read.extracted", processing, processingReferenceTimeMs: reference, inputs });
  const steps: AutomationStudioFlowDraftStep[] = [];
  const sources = new Map<string, { schema: AutomationStudioRecordSchema; rows: JsonObject[] }>();
  /** `own`: the read's own `recordOutput.process`, as a model writes it on the call; `url`: the address it read, where one is said. */
  const read = (source: string, rows: JsonObject[], schema = SCHEMA, place = "page=1", own?: JsonValue, url?: string) => {
    const checked = validateAutomationStudioRecords(rows, schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
    const fields = Object.fromEntries(schema.fields.filter((field) => field.handling !== "exclude").map((field) => [field.id, `.${field.id}`]));
    const value: JsonObject = { node: "fixture.read", parameters: { read: { fields }, ...(own === undefined ? {} : { recordOutput: { datasetId: "records", process: own } }) } };
    const step: AutomationStudioFlowDraftStep = { id: source, callId: source, position: steps.length + 1, iteration: steps.length + 1, disposition: "kept", proposes: true, effect: "observe", input: value, toolId: "core.run_node", actionId: "fixture.read" };
    steps.push(step);
    const storedSchema = { ...schema, fields: schema.fields.filter((field) => field.handling !== "exclude") };
    sources.set(`read.${source}`, { schema: storedSchema, rows: checked.rows });
    feed.expect({ kind: "add", position: step.position, intermediate: false });
    feed.called({ callId: source, toolId: "core.run_node", value }, { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { read: { extracted: checked.rows, listKey: "fixture.records", place, ...(url === undefined ? {} : { url }) } } }, { rows: checked.rows, schema: storedSchema, datasetId: `read.${source}`, invalidCount: checked.invalidCount, truncated: checked.truncated });
    feed.draft(steps);
    return step;
  };
  return { feed, processing, steps, sources, read };
}
