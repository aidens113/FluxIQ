import type { DataStep } from "@fluxiq/contracts/fluxnode";
import type { PipelineRecord } from "../types.ts";
import { keyOf } from "./key-of.ts";

/** Keeps the first or last record of each key, where it first (or last) appeared. */
export function dedupeStep(step: Extract<DataStep, { kind: "dedupe" }>, records: readonly PipelineRecord[]): PipelineRecord[] {
  if (step.keep === "first") {
    const seen = new Set<string>();
    return records.filter((record) => {
      const key = keyOf(record.data, step.key);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const lastIndex = new Map<string, number>();
  records.forEach((record, index) => lastIndex.set(keyOf(record.data, step.key), index));
  return records.filter((record, index) => lastIndex.get(keyOf(record.data, step.key)) === index);
}
