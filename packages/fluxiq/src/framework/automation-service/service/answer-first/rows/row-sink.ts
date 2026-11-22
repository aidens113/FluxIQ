// Stores real read pages and publishes the ledger's explicit answer. Storage never chooses a result.
// Each call has its own capture dataset; pages are joined, replaced, folded and versioned only by ../result/.
// publish writes that declared answer as one replacement, so Data/export and the judge see the same rows.
//
// **One result in the run.** A publication is under its output step's version (`step.<id>.v<n>`), so when the output
// step or its version changes, the new answer goes under a new dataset, and the earlier one would stay listed beside it
// as a second result (Data/export, the judge's listing). Under D1 a superseded version is no longer the result (its pages
// are dropped), so once the new publication is stored, every other publication this run holds is retired through
// `retire`. That includes a carried-on copy of the earlier segment's publication (`carried`). Capture datasets (`read.*`) and a
// saved Flow's own batches are never publications and always stay: every run's rows are collected into its datasets.
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, parseAutomationStudioRecordSchema, storedAutomationStudioRecordSchema, validateAutomationStudioRecords, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import { stableJson } from "../../stable-json.ts";
import { automationStudioAnswerFirstReadSchema } from "./derived-schema.ts";
import { automationStudioAnswerFirstStoredDatasetId } from "./dataset-id.ts";
import { automationStudioAnswerFirstReadRows } from "./found-rows.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "./rows-summary.ts";
import type { AutomationStudioAnswerFirstRowSinkInput } from "./sink-input.ts";
import type { AutomationStudioAnswerFirstRowSink } from "./sink-type.ts";
import { automationStudioAnswerFirstMergedSchema } from "./merged-schema.ts";

type Stored = { schema: AutomationStudioRecordSchema; rows: JsonObject[]; truncated: boolean };
type IndexedBatch = Pick<Stored, "rows" | "truncated"> & { receipt: string };
const EMPTY: AutomationStudioAnswerFirstRowsSummary = { totalRows: 0, truncated: false, columns: [], rows: [] };
const READ_BACK_PAGE = 200;
/** A carried publication's fingerprint: matches no real one, so a publication under the same id writes over it. */
const CARRIED = "";
/** The namespace `./dataset-id.ts` gives a publication (kind `step`), and nothing else. */
const PUBLICATION_PREFIX = "step.";

export function automationStudioAnswerFirstRowSink(input: AutomationStudioAnswerFirstRowSinkInput): AutomationStudioAnswerFirstRowSink {
  const datasets = new Map<string, Stored>();
  const batches = new Map<string, Map<string, IndexedBatch>>();
  const published = new Map<string, string>();
  let readsAnswered = 0;
  let publication = 0;
  const summary = (datasetId?: string): AutomationStudioAnswerFirstRowsSummary => {
    const held = datasetId === undefined ? undefined : datasets.get(datasetId);
    return !held || datasetId === undefined ? EMPTY : { datasetId, totalRows: held.rows.length, truncated: held.truncated, schema: storedAutomationStudioRecordSchema(held.schema), columns: storedAutomationStudioRecordSchema(held.schema).fields.map(({ id, label }) => ({ id, label })), rows: held.rows.map((row) => ({ ...row })) };
  };
  const remember = (batch: AutomationStudioRecordBatch, schema = batch.schema): void => {
    const held = batch.writeMode === "replace" ? new Map<string, IndexedBatch>() : batches.get(batch.datasetId) ?? new Map<string, IndexedBatch>();
    const prior = held.get(batch.batchKey);
    const receipt = stableJson({ attemptId: batch.attemptId, nodeId: batch.nodeId, schema: batch.schema, process: batch.process ?? null, label: batch.label ?? null, invalidCount: batch.invalidCount, evidence: batch.evidence ?? null });
    if (prior && stableJson(prior.rows) === stableJson(batch.rows) && prior.truncated === batch.truncated && prior.receipt === receipt) return;
    held.delete(batch.batchKey);
    held.set(batch.batchKey, { rows: batch.rows, truncated: batch.truncated, receipt });
    batches.set(batch.datasetId, held);
    datasets.set(batch.datasetId, { schema, rows: [...held.values()].flatMap((entry) => entry.rows), truncated: [...held.values()].some((entry) => entry.truncated) });
  };
  /**
   * Retires every publication but `current`. One the store could not remove stays listed here, so the next
   * publication tries it again; a failure never costs the publication just stored, which is the result.
   */
  const retireSuperseded = async (current: string): Promise<void> => {
    const retire = input.retire;
    if (!retire) return;
    for (const datasetId of [...published.keys()]) {
      if (datasetId === current) continue;
      try { await retire(datasetId); }
      catch { continue; }
      published.delete(datasetId);
      datasets.delete(datasetId);
      batches.delete(datasetId);
    }
  };
  return {
    async fromCall(call, answer) {
      const found = automationStudioAnswerFirstReadRows(answer, input.readRowsKey);
      if (!found) return undefined;
      if (answer.recordSchema === null) return { rows: [], invalidCount: found.length, truncated: false, failure: { code: "answer_first.rows_invalid_schema", issues: ["record_schema.invalid"] } };
      if (!found.length && answer.recordSchema === undefined) {
        readsAnswered += 1;
        return { rows: [], invalidCount: 0, truncated: false };
      }
      const declared = answer.recordSchema ?? automationStudioAnswerFirstReadSchema(found.filter(isObject));
      if (!declared) return { rows: [], invalidCount: found.length, truncated: false, failure: { code: "answer_first.rows_no_columns" } };
      const parsed = parseAutomationStudioRecordSchema(declared);
      if (!parsed.ok) return { rows: [], invalidCount: found.length, truncated: false, failure: { code: "answer_first.rows_invalid_schema", issues: parsed.issues } };
      const schema = parsed.schema;
      const validated = validateAutomationStudioRecords(found, schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
      const datasetId = automationStudioAnswerFirstStoredDatasetId("read", call.callId);
      const batch: AutomationStudioRecordBatch = { nodeId: `exploration.${call.toolId}`, attemptId: call.callId, batchKey: `read/${encodeURIComponent(call.callId)}`, datasetId, writeMode: "replace", schema, rows: validated.rows, invalidCount: validated.invalidCount, truncated: validated.truncated };
      try { await input.onRecordBatch(batch); }
      catch (error) { return { rows: [], datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated, failure: { code: "answer_first.rows_not_stored", ...(error instanceof Error ? { errorName: error.name } : {}) } }; }
      remember(batch);
      readsAnswered += 1;
      return { rows: validated.rows, schema: storedAutomationStudioRecordSchema(schema), datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated };
    },
    async recordBatch(batch) {
      const schema = automationStudioAnswerFirstMergedSchema(batch.writeMode === "replace" ? undefined : datasets.get(batch.datasetId)?.schema, batch.schema);
      const result = await input.onRecordBatch(batch);
      remember(batch, schema);
      readsAnswered += 1;
      return result;
    },
    async publish(answer, evidence) {
      if (answer.datasetId === undefined) return;
      const fingerprint = stableJson({ columns: answer.columns, rows: answer.rows, schema: answer.schema, truncated: answer.truncated, ...(evidence === undefined ? {} : { evidence }) });
      if (published.get(answer.datasetId) === fingerprint) return await retireSuperseded(answer.datasetId);
      // Every publication is the whole answer, so it starts its dataset over and declares its own schema and
      // processing. Neither is fixed for a version: an unsure or empty contract answers with the columns the
      // rows hold (`../result/answer.ts`), which a later page can widen, and a carried-on attempt first copies
      // the earlier segment's publication into this run under the same id (`./copied-rows.ts`). Written as an
      // ordinary batch, the store refuses both for the rest of the run ("schema changed within one run").
      const schema: AutomationStudioRecordSchema = answer.schema ?? { schemaVersion: "0.1", fields: answer.columns.map(({ id, label }) => ({ id, label, valueType: "json" })) };
      if (!schema.fields.length) return;
      publication += 1;
      const batch: AutomationStudioRecordBatch = { nodeId: answer.datasetId, attemptId: `publication.${publication}`, batchKey: `result/${publication}`, datasetId: answer.datasetId, writeMode: "replace", schema, rows: answer.rows.map((row) => ({ ...row })), invalidCount: 0, truncated: answer.truncated, process: { dedupe: false, columns: answer.columns.map(({ id }) => id) }, ...(evidence === undefined ? {} : { evidence: JSON.parse(JSON.stringify(evidence)) as JsonObject }) };
      await (input.startOver ?? input.onRecordBatch)(batch);
      remember(batch);
      published.set(answer.datasetId, fingerprint);
      await retireSuperseded(answer.datasetId);
    },
    carried(datasetId) {
      if (datasetId.startsWith(PUBLICATION_PREFIX) && !published.has(datasetId)) published.set(datasetId, CARRIED);
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
      let schema = own.schema;
      do {
        const page = await reader.getPage({ datasetId, limit: READ_BACK_PAGE, retained: "answer", ...(cursor === undefined ? {} : { cursor }) });
        if (!page) throw new Error("answer_first.published_page_missing");
        columns = page.displayColumns ?? page.schema.fields.map(({ id, label }) => ({ id, label }));
        schema = page.schema;
        rows.push(...page.rows);
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      return { datasetId, totalRows: rows.length, truncated: own.truncated || stored.truncated, columns, rows, ...(schema === undefined ? {} : { schema }), fromStore: true };
    }
  };
}

function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
