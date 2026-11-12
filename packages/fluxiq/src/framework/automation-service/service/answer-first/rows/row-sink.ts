// Stores real read pages and publishes the ledger's explicit answer. Storage never chooses a result.
// Each call has its own capture dataset; pages are joined, replaced, folded and versioned only by ../result/.
// publish writes that declared answer as one replacement, so Data/export and the judge see the same rows.
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, validateAutomationStudioRecords, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import { stableJson } from "../../stable-json.ts";
import { automationStudioAnswerFirstReadSchema } from "./derived-schema.ts";
import { automationStudioAnswerFirstStoredDatasetId } from "./dataset-id.ts";
import { automationStudioAnswerFirstReadRows } from "./found-rows.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "./rows-summary.ts";
import type { AutomationStudioAnswerFirstRowSinkInput } from "./sink-input.ts";
import type { AutomationStudioAnswerFirstRowSink } from "./sink-type.ts";

type Stored = { schema: AutomationStudioRecordSchema; rows: JsonObject[]; truncated: boolean };
const EMPTY: AutomationStudioAnswerFirstRowsSummary = { totalRows: 0, truncated: false, columns: [], rows: [] };
const READ_BACK_PAGE = 200;

export function automationStudioAnswerFirstRowSink(input: AutomationStudioAnswerFirstRowSinkInput): AutomationStudioAnswerFirstRowSink {
  const datasets = new Map<string, Stored>();
  const published = new Map<string, string>();
  let readsAnswered = 0;
  let publication = 0;
  const summary = (datasetId?: string): AutomationStudioAnswerFirstRowsSummary => {
    const held = datasetId === undefined ? undefined : datasets.get(datasetId);
    return !held || datasetId === undefined ? EMPTY : { datasetId, totalRows: held.rows.length, truncated: held.truncated, columns: held.schema.fields.map(({ id, label }) => ({ id, label })), rows: held.rows.map((row) => ({ ...row })) };
  };
  const remember = (batch: AutomationStudioRecordBatch): void => {
    const previous = datasets.get(batch.datasetId);
    datasets.set(batch.datasetId, { schema: batch.schema, rows: batch.writeMode === "replace" ? batch.rows : [...(previous?.rows ?? []), ...batch.rows], truncated: batch.truncated || (batch.writeMode !== "replace" && previous?.truncated === true) });
  };
  return {
    async fromCall(call, answer) {
      const found = automationStudioAnswerFirstReadRows(answer, input.readRowsKey);
      if (!found) return undefined;
      if (!found.length) {
        readsAnswered += 1;
        return { rows: [], invalidCount: 0, truncated: false };
      }
      const schema = automationStudioAnswerFirstReadSchema(found.filter(isObject));
      if (!schema) return { rows: [], invalidCount: found.length, truncated: false, failure: { code: "answer_first.rows_no_columns" } };
      const validated = validateAutomationStudioRecords(found, schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
      const datasetId = automationStudioAnswerFirstStoredDatasetId("read", call.callId);
      const batch: AutomationStudioRecordBatch = { nodeId: `exploration.${call.toolId}`, attemptId: call.callId, batchKey: `read/${encodeURIComponent(call.callId)}`, datasetId, writeMode: "replace", schema, rows: validated.rows, invalidCount: validated.invalidCount, truncated: validated.truncated };
      try { await input.onRecordBatch(batch); }
      catch (error) { return { rows: [], datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated, failure: { code: "answer_first.rows_not_stored", ...(error instanceof Error ? { errorName: error.name } : {}) } }; }
      remember(batch);
      readsAnswered += 1;
      return { rows: validated.rows, datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated };
    },
    async recordBatch(batch) {
      const result = await input.onRecordBatch(batch);
      remember(batch);
      readsAnswered += 1;
      return result;
    },
    async publish(answer, evidence) {
      if (answer.datasetId === undefined) return;
      const fingerprint = stableJson({ columns: answer.columns, rows: answer.rows, truncated: answer.truncated, ...(evidence === undefined ? {} : { evidence }) });
      if (published.get(answer.datasetId) === fingerprint) return;
      // Version datasets accept changing values without schema drift; the declared columns and their order stay fixed.
      const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: answer.columns.map(({ id, label }) => ({ id, label, valueType: "json" })) };
      if (!schema.fields.length) return;
      publication += 1;
      const batch: AutomationStudioRecordBatch = { nodeId: answer.datasetId, attemptId: `publication.${publication}`, batchKey: `result/${publication}`, datasetId: answer.datasetId, writeMode: "replace", schema, rows: answer.rows.map((row) => ({ ...row })), invalidCount: 0, truncated: answer.truncated, process: { dedupe: false }, ...(evidence === undefined ? {} : { evidence: JSON.parse(JSON.stringify(evidence)) as JsonObject }) };
      await input.onRecordBatch(batch);
      remember(batch);
      published.set(answer.datasetId, fingerprint);
    },
    readsAnswered: () => readsAnswered,
    summary,
    async readBack(datasetId) {
      const own = summary(datasetId);
      const reader = input.reader;
      if (!reader) return { ...own, fromStore: false };
      await reader.process?.();
      if (datasetId === undefined) return { ...own, fromStore: false };
      const stored = (await reader.listDatasets()).find((dataset) => dataset.datasetId === datasetId);
      if (!stored) return { ...own, fromStore: false };
      const rows: JsonObject[] = [];
      let cursor: string | undefined;
      let columns = own.columns;
      do {
        const page = await reader.getPage({ datasetId, limit: READ_BACK_PAGE, ...(cursor === undefined ? {} : { cursor }) });
        if (!page) throw new Error("answer_first.published_page_missing");
        columns = page.schema.fields.map(({ id, label }) => ({ id, label }));
        rows.push(...page.rows);
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      return { datasetId, totalRows: rows.length, truncated: own.truncated || stored.truncated, columns, rows, fromStore: true };
    }
  };
}

function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
