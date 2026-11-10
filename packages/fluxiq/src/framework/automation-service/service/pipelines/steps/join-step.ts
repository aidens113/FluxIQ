import type { DataFieldPath, DataStep } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import { readField } from "../expression/index.ts";
import type { PipelineRecord, PipelineRunContext } from "../types.ts";
import { deriveRecord } from "./derive-record.ts";
import { keyOf } from "./key-of.ts";

function matchable(data: JsonObject, paths: readonly DataFieldPath[]): boolean {
  return paths.every((path) => readField(data, path) !== null);
}

/**
 * Matches each left record with the right records that have equal `on` values (a null
 * never matches). An inner join drops a left record with no match, a left join keeps it
 * as it is. A match fields merge into the record (the left wins), or go under `as`.
 * A left record with several matches gives several records.
 */
export function joinStep(step: Extract<DataStep, { kind: "join" }>, left: readonly PipelineRecord[], right: readonly PipelineRecord[], context: PipelineRunContext): PipelineRecord[] {
  const leftPaths = step.on.map((pair) => pair.left);
  const rightPaths = step.on.map((pair) => pair.right);
  const index = new Map<string, PipelineRecord[]>();
  for (const record of right) {
    if (!matchable(record.data, rightPaths)) continue;
    const key = keyOf(record.data, rightPaths);
    index.set(key, [...(index.get(key) ?? []), record]);
  }
  const out: PipelineRecord[] = [];
  left.forEach((record, position) => {
    const matches = matchable(record.data, leftPaths) ? (index.get(keyOf(record.data, leftPaths)) ?? []) : [];
    if (matches.length === 0) {
      if (step.how === "left") out.push(record);
      return;
    }
    for (const match of matches) {
      const data: JsonObject = step.as === undefined ? { ...match.data, ...record.data } : { ...record.data, [step.as]: match.data };
      out.push(deriveRecord(context, step.id, data, [`/${position}`], [...record.lineage, ...match.lineage]));
    }
  });
  return out;
}
