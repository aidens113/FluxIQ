declare const executionRetrySeriesBrand: unique symbol;

/** Private invocation identity for a backend's attempts; it never grants admission. */
export interface ExecutionRetrySeries {
  readonly [executionRetrySeriesBrand]: never;
}
