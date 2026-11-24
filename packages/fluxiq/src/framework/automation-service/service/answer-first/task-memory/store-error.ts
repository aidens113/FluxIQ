// The task memory's store could not be read or written: unavailable, locked or busy, or an I/O failure.
// A best-effort reader may take it as nothing. It is raised only at the store boundary (`store-io.ts`),
// never for a programming error or a stored value Core refuses (`integrity-error.ts`).

/** The store behind a task memory could not be read or written. The driver's error is its `cause`. */
export class AutomationStudioAnswerFirstTaskMemoryStoreError extends Error {
  override readonly name = "AutomationStudioAnswerFirstTaskMemoryStoreError";
}
