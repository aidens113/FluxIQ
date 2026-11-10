import { isJsonObject } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../core/index.ts";
import type { PipelineRecord } from "../../../../framework/automation-service/service/pipelines/index.ts";

/** The records a pipeline node was handed on a port: a list of `{ data, lineage }`, or nothing for a list that is none. */
export function pipelineNodeRecords(value: JsonValue | undefined): PipelineRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const records: PipelineRecord[] = [];
  for (const item of value) {
    if (!isJsonObject(item) || !isJsonObject(item["data"]) || !Array.isArray(item["lineage"])) return undefined;
    records.push({ data: item["data"], lineage: item["lineage"] as unknown as PipelineRecord["lineage"] });
  }
  return records;
}
