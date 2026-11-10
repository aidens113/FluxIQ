import { asRecord, numberOf, shapeRun } from "../../home/model";
import { readRunExtras } from "./read-run-extras";
import type { RunRow } from "./types";

/** One `list-flow-runs` summary as a Runs row, or undefined when it cannot be linked to (no run id, Flow or time). */
export function shapeRunRow(raw: unknown, flowNames: ReadonlyMap<string, string>): RunRow | undefined {
  const base = shapeRun(raw, flowNames);
  if (!base) return undefined;
  const row = asRecord(raw);
  const steps = numberOf(row?.actionAttemptCount);
  return { ...base, ...(steps !== undefined ? { steps } : {}), ...readRunExtras(row?.metadata) };
}
