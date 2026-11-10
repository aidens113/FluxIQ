import type { DataStep } from "@fluxiq/contracts/fluxnode";
import { compareValues, readField } from "../expression/index.ts";
import type { PipelineRecord } from "../types.ts";

/** Orders records by each field in turn, stably. Null sorts last whichever way the order runs. */
export function sortStep(step: Extract<DataStep, { kind: "sort" }>, records: readonly PipelineRecord[]): PipelineRecord[] {
  return [...records].sort((left, right) => {
    for (const { field, order } of step.by) {
      const a = readField(left.data, field);
      const b = readField(right.data, field);
      if (a === null || b === null) {
        if (a === b) continue;
        return a === null ? 1 : -1;
      }
      const difference = compareValues(a, b);
      if (difference !== 0) return order === "desc" ? -difference : difference;
    }
    return 0;
  });
}
