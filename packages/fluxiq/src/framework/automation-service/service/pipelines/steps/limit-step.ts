import type { DataStep } from "@fluxiq/contracts/fluxnode";
import type { PipelineRecord } from "../types.ts";

/** Keeps `count` records after skipping `offset`. */
export function limitStep(step: Extract<DataStep, { kind: "limit" }>, records: readonly PipelineRecord[]): PipelineRecord[] {
  const offset = step.offset ?? 0;
  return records.slice(offset, offset + step.count);
}
