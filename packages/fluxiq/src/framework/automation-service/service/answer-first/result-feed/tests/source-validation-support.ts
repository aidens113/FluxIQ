import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, validateAutomationStudioRecords, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstResultFeed } from "../index.ts";

/** A real validated reread of one explicit kept source, including its original rejection count. */
export function reread(feed: AutomationStudioAnswerFirstResultFeed, step: AutomationStudioFlowDraftStep, callId: string, originals: JsonObject[], schema: AutomationStudioRecordSchema, place: string) {
  const checked = validateAutomationStudioRecords(originals, schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
  feed.expect({ kind: "rerun", step });
  feed.called({ callId, toolId: "core.run_node", value: step.input }, { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { read: { extracted: checked.rows, listKey: "fixture.records", place } } }, { rows: checked.rows, schema: { ...schema, fields: schema.fields.filter((field) => field.handling !== "exclude") }, datasetId: `read.${callId}`, invalidCount: checked.invalidCount, truncated: checked.truncated });
}
