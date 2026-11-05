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
//
// **A saved Flow's run and a later read of the same list are one result.** A run's batches
// (`recordBatch`) go under the dataset its record output names, and a read made afterwards has
// an id of its own, which alone would drop the run's rows from the result. So a read joins the
// latest dataset a run wrote that it can be stored in whole: its columns include every field of
// that dataset, and every row of it fits that schema, which also takes off what the read minted.
// It is stored under that dataset, with its schema and processing (the store refuses either
// changing within a run), so a row read again is dropped as a row repeated whole and a new one
// adds. That can take in another list with the same columns: a list wrongly joined is rows a judge
// can read and refuse, and a row wrongly dropped is a result lost. A read that does not join is
// something else, and `./result-dataset.ts` says when it may become the result.
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, validateAutomationStudioRecords, type AutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
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

type Held = { schema: AutomationStudioRecordSchema; rows: JsonObject[]; seen: Set<string>; truncated: boolean; label?: string | undefined; process?: AutomationStudioRecordProcessing | undefined };

export function automationStudioAnswerFirstRowSink(input: AutomationStudioAnswerFirstRowSinkInput): AutomationStudioAnswerFirstRowSink {
  const datasets = new Map<string, Held>();
  /** Dataset ids in the order rows were stored to them. */
  const order: string[] = [];
  /** The datasets a saved Flow's run wrote, while its rows stand (`runRowsRefused`). */
  const ran = new Set<string>();

  const keep = (held: Held, rows: readonly JsonObject[], truncated: boolean): void => {
    for (const row of rows) {
      const key = stableJson(row);
      if (held.seen.has(key)) continue;
      held.seen.add(key);
      held.rows.push(row);
    }
    held.truncated ||= truncated;
  };

  /** The latest dataset a run wrote that takes these rows whole (header), and what they come to under it. */
  const joined = (columns: readonly string[], found: readonly unknown[]) => {
    const latest = order.filter((datasetId) => ran.has(datasetId)).at(-1) ?? [...ran].at(-1);
    const held = latest === undefined ? undefined : datasets.get(latest);
    if (latest === undefined || !held || !held.schema.fields.every((field) => columns.includes(field.id))) return undefined;
    const validated = validateAutomationStudioRecords(found, held.schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
    return validated.invalidCount === 0 ? { datasetId: latest, held, validated } : undefined;
  };

  const summary = (): AutomationStudioAnswerFirstRowsSummary => {
    const datasetId = automationStudioAnswerFirstResultDataset(order, ran.size ? { ids: ran, rowsOf: (id) => datasets.get(id)?.rows.length ?? 0 } : undefined);
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
      const join = joined(columns, found);
      const datasetId = join?.datasetId ?? automationStudioAnswerFirstReadDatasetId({ toolId: call.toolId, value: call.value, columns });
      // A later page of the same read keeps the schema the first page fixed: the store refuses a dataset whose schema changes within a run.
      const schema = datasets.get(datasetId)?.schema ?? automationStudioAnswerFirstReadSchema(objects);
      if (!schema) return { rows: [], invalidCount: found.length, truncated: false, failure: { code: "answer_first.rows_no_columns" } };
      const validated = join?.validated ?? validateAutomationStudioRecords(found, schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
      const batch: AutomationStudioRecordBatch = {
        nodeId: `exploration.${call.toolId}`,
        attemptId: call.callId,
        batchKey: automationStudioRecordBatchKey([], call.callId),
        datasetId,
        ...(join?.held.label !== undefined ? { label: join.held.label } : {}),
        writeMode: "append",
        schema,
        rows: validated.rows,
        invalidCount: validated.invalidCount,
        truncated: validated.truncated,
        ...(join?.held.process !== undefined ? { process: join.held.process } : {})
      };
      try {
        await input.onRecordBatch(batch);
      } catch (error) {
        return { rows: [], datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated, failure: { code: "answer_first.rows_not_stored", ...(error instanceof Error ? { errorName: error.name } : {}) } };
      }
      const held = datasets.get(datasetId) ?? { schema, rows: [], seen: new Set<string>(), truncated: false };
      datasets.set(datasetId, held);
      keep(held, validated.rows, validated.truncated);
      if (validated.rows.length) order.push(datasetId);
      return { rows: validated.rows, datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated };
    },
    async recordBatch(batch) {
      const stored = await input.onRecordBatch(batch);
      const held = datasets.get(batch.datasetId) ?? { schema: batch.schema, rows: [], seen: new Set<string>(), truncated: false, label: batch.label, process: batch.process };
      datasets.set(batch.datasetId, held);
      // As the store reads it: `replace` clears what the dataset held.
      if (batch.writeMode === "replace") {
        held.rows = [];
        held.seen.clear();
      }
      keep(held, batch.rows, batch.truncated);
      ran.add(batch.datasetId);
      if (batch.rows.length) order.push(batch.datasetId);
      return stored;
    },
    runRowsRefused() {
      ran.clear();
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
        // Processed, the dataset answers with its own dedupe. Before that (a completion judged while the
        // attempt's session is open) it holds every batch as collected, a run's and a read's of the same rows
        // among them, so a row repeated whole counts once here, as `summary` counts it and processing will.
        if (stored.processing !== undefined) return { datasetId: own.datasetId, totalRows: stored.recordCount, truncated: stored.truncated || own.truncated, columns, rows, fromStore: true };
        const seen = new Set<string>();
        const once = rows.filter((row) => {
          const key = stableJson(row);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { datasetId: own.datasetId, totalRows: once.length, truncated: stored.truncated || own.truncated, columns, rows: once, fromStore: true };
      } catch {
        return { ...own, fromStore: false };
      }
    }
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
