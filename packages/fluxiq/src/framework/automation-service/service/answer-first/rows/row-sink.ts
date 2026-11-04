// The row sink of an answer-first exploration: every real read's rows go into
// the run's dataset, so the result comes from rows a read returned and never
// from a model's words (answer-first plan D9; discovery "Missing for a
// finisher" item 2).
//
// **What it stores.** Only what a tool call's *answer* holds as a read's rows
// (`./found-rows.ts`). A call's input, a `complete` decision and any field a
// model wrote are never looked at, so none of them can become a row. The
// batch is a real `AutomationStudioRecordBatch`, as a Flow's record output
// would capture it: a schema derived from the read, rows allowlist-copied by
// `validateAutomationStudioRecords` (so a read's minted `$`, handle and
// evidence fields are dropped), `invalidCount` and `truncated` as that
// validation counts them, a `datasetId` the same for every page of the same
// read, and a `batchKey` unique to the call.
//
// **A store that fails does not fail the call.** The failure comes back as
// data (a code and an error name, never the error's words, which may quote a
// value), nothing of that batch joins the sink's account, and the exploration
// goes on; the same rows are stored the next time the model reads them.
//
// **Repeats.** The store keeps every batch; processing at the run's end drops
// a row repeated whole (the default dedupe). `summary` counts the same way,
// and `readBack` has the reader process the datasets first.
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, validateAutomationStudioRecords, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import { automationStudioRecordBatchKey } from "../../../../../engine/automation/records/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { stableJson } from "../../stable-json.ts";
import { automationStudioAnswerFirstReadColumns } from "./carried-columns.ts";
import { automationStudioAnswerFirstReadDatasetId } from "./dataset-of-read.ts";
import { automationStudioAnswerFirstReadSchema } from "./derived-schema.ts";
import { automationStudioAnswerFirstReadRows } from "./found-rows.ts";
import { automationStudioAnswerFirstResultDataset } from "./result-dataset.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "./rows-summary.ts";
import type { AutomationStudioAnswerFirstRowSinkInput } from "./sink-input.ts";
import type { AutomationStudioAnswerFirstRowSink } from "./sink-type.ts";

/** Rows asked of the store in one page when reading back. */
const READ_BACK_PAGE = 200;

type Held = { schema: AutomationStudioRecordSchema; rows: JsonObject[]; seen: Set<string>; truncated: boolean };

export function automationStudioAnswerFirstRowSink(input: AutomationStudioAnswerFirstRowSinkInput): AutomationStudioAnswerFirstRowSink {
  const datasets = new Map<string, Held>();
  /** Dataset ids in the order rows were stored to them. */
  const order: string[] = [];

  const summary = (): AutomationStudioAnswerFirstRowsSummary => {
    const datasetId = automationStudioAnswerFirstResultDataset(order);
    const held = datasetId === undefined ? undefined : datasets.get(datasetId);
    if (datasetId === undefined || !held) return { totalRows: 0, truncated: false, columns: [], rows: [] };
    return { datasetId, totalRows: held.rows.length, truncated: held.truncated, columns: held.schema.fields.map(({ id, label }) => ({ id, label })), rows: held.rows.map((row) => ({ ...row })) };
  };

  return {
    async fromCall(call, answer) {
      const found = automationStudioAnswerFirstReadRows(answer, input.readRowsKey);
      if (!found) return undefined;
      const objects = found.filter(isObject);
      if (!found.length) return { rows: [], invalidCount: 0, truncated: false };
      const columns = automationStudioAnswerFirstReadColumns(objects);
      const datasetId = automationStudioAnswerFirstReadDatasetId({ toolId: call.toolId, value: call.value, columns });
      // A later page of the same read keeps the schema the first page fixed: the store refuses a dataset whose schema changes within a run.
      const schema = datasets.get(datasetId)?.schema ?? automationStudioAnswerFirstReadSchema(objects);
      if (!schema) return { rows: [], invalidCount: found.length, truncated: false, failure: { code: "answer_first.rows_no_columns" } };
      const validated = validateAutomationStudioRecords(found, schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
      const batch: AutomationStudioRecordBatch = {
        nodeId: `exploration.${call.toolId}`,
        attemptId: call.callId,
        batchKey: automationStudioRecordBatchKey([], call.callId),
        datasetId,
        writeMode: "append",
        schema,
        rows: validated.rows,
        invalidCount: validated.invalidCount,
        truncated: validated.truncated
      };
      try {
        await input.onRecordBatch(batch);
      } catch (error) {
        return { rows: [], datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated, failure: { code: "answer_first.rows_not_stored", ...(error instanceof Error ? { errorName: error.name } : {}) } };
      }
      const held = datasets.get(datasetId) ?? { schema, rows: [], seen: new Set<string>(), truncated: false };
      datasets.set(datasetId, held);
      for (const row of validated.rows) {
        const key = stableJson(row);
        if (held.seen.has(key)) continue;
        held.seen.add(key);
        held.rows.push(row);
      }
      held.truncated ||= validated.truncated;
      if (validated.rows.length) order.push(datasetId);
      return { rows: validated.rows, datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated };
    },
    summary,
    async readBack() {
      const own = summary();
      const reader = input.reader;
      if (!reader || own.datasetId === undefined) return { ...own, fromStore: false };
      try {
        await reader.process?.();
        const stored = (await reader.listDatasets()).find((dataset) => dataset.datasetId === own.datasetId);
        if (!stored) return { ...own, fromStore: false };
        const rows: JsonObject[] = [];
        let cursor: string | undefined;
        let columns = own.columns;
        do {
          const page = await reader.getPage({ datasetId: own.datasetId, limit: READ_BACK_PAGE, ...(cursor !== undefined ? { cursor } : {}) });
          if (!page) return { ...own, fromStore: false };
          columns = page.schema.fields.map(({ id, label }) => ({ id, label }));
          rows.push(...page.rows);
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
        return { datasetId: own.datasetId, totalRows: stored.recordCount, truncated: stored.truncated || own.truncated, columns, rows, fromStore: true };
      } catch {
        return { ...own, fromStore: false };
      }
    }
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
