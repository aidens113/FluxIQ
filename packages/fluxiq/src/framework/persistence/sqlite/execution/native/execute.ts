import { recordSqlPerformance } from "../../../../observability/performance/sql/index.ts";
import type { SQLiteNativeCompletion } from "./completion.ts";
import type { SQLiteNativeObservation } from "./observation.ts";
import type { SQLiteNativeStage } from "./stage.ts";

/** One delivery path for legacy callbacks and the explicitly observed native owner. */
export function executeSQLiteNative<TResult>(observation: SQLiteNativeObservation | undefined, stage: SQLiteNativeStage, submit: (complete: SQLiteNativeCompletion<TResult>) => void): Promise<TResult> {
  if (observation) return observation.perform(stage, submit);
  return new Promise<TResult>((resolve, reject) => {
    submit((error, value, metric) => {
      if (metric) recordSqlPerformance(metric);
      if (error) reject(error);
      else resolve(value);
    });
  });
}
