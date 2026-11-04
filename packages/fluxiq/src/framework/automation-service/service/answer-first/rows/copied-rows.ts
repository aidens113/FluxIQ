// A carried-on attempt's rows (design, "Carry on"). It has a new run, because the old one ended and
// was processed, and the rows it had found live under the old one. So they are copied into the new
// run under the same dataset ids, through `recordBatch`, so a later read joins them and the result
// does not drop them. A batch's key is made from where its rows came from, so the same rows copied
// twice are one batch.
//
// **The result's dataset goes last**, since the latest one written is what reads as the result.
//
// **The stored rows, else what the row showed.** A store that cannot be read, or a host with none,
// leaves the preview the attempt's row holds, which is rows it really read, under-counted at worst.

import { createHash } from "node:crypto";
import type { AutomationStudioRunDatasetPage, AutomationStudioRunDatasetSummary, AutomationStudioTaskResultRows } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioRecordBatchKey } from "../../../../../engine/automation/records/index.ts";
import { stableJson } from "../../stable-json.ts";
import { automationStudioAnswerFirstReadSchema } from "./derived-schema.ts";
import type { AutomationStudioAnswerFirstRowSink } from "./sink-type.ts";

const PAGE = 200;
const NODE_ID = "carried.rows";

type Input = {
  sink: Pick<AutomationStudioAnswerFirstRowSink, "recordBatch">;
  /** The attempt's last run: its stored rows, or none where there is no store. */
  stored: { runId: string; list(): Promise<AutomationStudioRunDatasetSummary[]>; page(input: { datasetId: string; limit: number; cursor?: string }): Promise<AutomationStudioRunDatasetPage | null> } | undefined;
  /** What the attempt's row shows as its result. */
  shown: AutomationStudioTaskResultRows | undefined;
};

/** Copies them. Whether all of it went: a failure costs what was not copied, and the caller says so. */
export async function automationStudioAnswerFirstCopyRows(input: Input): Promise<{ ok: boolean; rows: number }> {
  if (!input.stored) return await fromShown(input, true);
  try {
    return { ok: true, rows: await fromStore(input, input.stored) };
  } catch {
    return await fromShown(input, false);
  }
}

async function fromStore(input: Input, stored: NonNullable<Input["stored"]>): Promise<number> {
  const datasets = (await stored.list()).reverse();
  const inOrder = [...datasets.filter((each) => each.datasetId !== input.shown?.datasetId), ...datasets.filter((each) => each.datasetId === input.shown?.datasetId)];
  let copied = 0;
  for (const dataset of inOrder) {
    const seen = new Set<string>();
    let cursor: string | undefined;
    let part = 0;
    do {
      const page = await stored.page({ datasetId: dataset.datasetId, limit: PAGE, ...(cursor === undefined ? {} : { cursor }) });
      if (!page) break;
      const rows = page.rows.filter((row) => !seen.has(stableJson(row)) && Boolean(seen.add(stableJson(row))));
      if (rows.length) await copy(input, stored.runId, dataset.datasetId, part, page.schema, rows, { label: dataset.label, truncated: dataset.truncated });
      copied += rows.length;
      part += 1;
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
  }
  return copied;
}

async function fromShown(input: Input, ok: boolean): Promise<{ ok: boolean; rows: number }> {
  const shown = input.shown;
  const schema = shown?.previewRows.length ? automationStudioAnswerFirstReadSchema(shown.previewRows) : undefined;
  if (!shown || !schema) return { ok, rows: 0 };
  try {
    await copy(input, shown.runId, shown.datasetId, 0, schema, shown.previewRows, { truncated: shown.truncated || shown.previewRows.length < shown.totalRows });
    return { ok, rows: shown.previewRows.length };
  } catch {
    return { ok: false, rows: 0 };
  }
}

async function copy(input: Input, fromRunId: string, datasetId: string, part: number, schema: AutomationStudioRunDatasetPage["schema"], rows: readonly JsonObject[], how: { label?: string | undefined; truncated: boolean }): Promise<void> {
  const whence = createHash("sha256").update(JSON.stringify([fromRunId, datasetId, part])).digest("hex").slice(0, 40);
  await input.sink.recordBatch({
    nodeId: NODE_ID,
    attemptId: `carried.${whence}`,
    batchKey: automationStudioRecordBatchKey([], `carried.${whence}`),
    datasetId,
    ...(how.label === undefined ? {} : { label: how.label }),
    writeMode: "append",
    schema,
    rows: [...rows],
    invalidCount: 0,
    truncated: how.truncated
  });
}
