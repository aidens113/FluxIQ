declare const entryBrand: unique symbol;

/** Only the configured authority can recognize an original entry. */
export interface ExecutionEntry {
  readonly [entryBrand]: never;
}
