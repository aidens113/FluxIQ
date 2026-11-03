import type { ExecutionCallbackObservation } from "../../../../runtime/execution-observation/contracts/index.ts";
import { publishObservedPerformanceMetric } from "../registry/index.ts";
import type { SqlPerformanceInput } from "./input.ts";
import { createSqlPerformanceMetric } from "./metric.ts";

const date = Date;
const now = date.now;
const recordedAt = (): number => {
  const globalDate = Object.getOwnPropertyDescriptor(globalThis, "Date");
  const dateNow = Object.getOwnPropertyDescriptor(date, "now");
  if (globalDate?.value !== date || dateNow?.value !== now || dateNow.get || dateNow.set) throw new Error("performance.execution.clock_changed");
  return now.call(date);
};

export async function recordObservedSqlPerformance(input: SqlPerformanceInput, observation: ExecutionCallbackObservation): Promise<void> {
  const metric = createSqlPerformanceMetric(input, recordedAt);
  if (metric) await publishObservedPerformanceMetric(metric, observation);
}
