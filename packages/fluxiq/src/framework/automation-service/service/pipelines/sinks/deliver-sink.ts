import { dataSinkSchema, type DataSink, type DatasetRef } from "@fluxiq/contracts/fluxnode";
import { PipelineError } from "../errors.ts";
import type { PipelineRecord, PipelineRunContext } from "../types.ts";
import { encodeCsv } from "./encode-csv.ts";

function missing(port: string, stepId: string): PipelineError {
  return new PipelineError(`pipeline.no_${port}`, `Step "${stepId}" needs the ${port} port, and none was given.`, stepId);
}

/**
 * Sends records to a sink and reports the dataset it stored, when it stored one. The
 * sink is checked again here, so a credential in a webhook address or a file path that
 * leaves the directory is refused even if the declaration was built without the schema.
 *
 * - dataset: through `writeDataset`;
 * - file: JSON (a list of the records) or CSV, through `writeFile`, which is confined to the caller's directory;
 * - webhook: one POST of `{ pipeline, runId, stepId, records }` through `fetch`; a non-2xx answer fails the step;
 * - sdk: the callback of the program, through `sdk.sink`.
 */
export async function deliverSink(stepId: string, sink: DataSink, records: readonly PipelineRecord[], context: PipelineRunContext): Promise<DatasetRef | undefined> {
  const checked = dataSinkSchema.safeParse(sink);
  if (!checked.success) throw new PipelineError("pipeline.bad_sink", `Step "${stepId}": ${checked.error.issues[0]?.message ?? "the sink is not valid."}`, stepId);
  const target = checked.data;
  const rows = records.map((record) => record.data);
  switch (target.kind) {
    case "dataset": {
      if (context.ports.writeDataset === undefined) throw missing("writeDataset", stepId);
      return context.ports.writeDataset(target.name, rows);
    }
    case "file": {
      if (context.ports.writeFile === undefined) throw missing("writeFile", stepId);
      await context.ports.writeFile(target.path, target.format === "csv" ? encodeCsv(rows) : `${JSON.stringify(rows, null, 2)}\n`);
      return undefined;
    }
    case "webhook": {
      if (context.ports.fetch === undefined) throw missing("fetch", stepId);
      const body = JSON.stringify({ pipeline: context.pipeline, runId: context.runId, stepId, records: rows });
      const response = await context.ports.fetch(target.url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: context.signal });
      if (!response.ok) throw new PipelineError("pipeline.webhook_failed", `Step "${stepId}": the webhook answered ${response.status}.`, stepId);
      return undefined;
    }
    case "sdk": {
      if (context.ports.sdk === undefined) throw missing("sdk", stepId);
      await context.ports.sdk.sink({ stepId, callback: target.callback, records: rows });
      return undefined;
    }
  }
}
