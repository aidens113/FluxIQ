import type { SqlPerformanceInput } from "../../../../observability/performance/sql/index.ts";

export type SQLiteNativeCompletion<TResult> = (error: Error | null, value: TResult, metric?: SqlPerformanceInput) => void;
