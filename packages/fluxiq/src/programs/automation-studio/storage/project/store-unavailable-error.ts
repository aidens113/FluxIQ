const CODE = "automation_studio.project_store_unavailable";

/**
 * The project store cannot be reached at all: its database pool is closing,
 * so every acquire is refused (`./database.ts`). Its message is what the pool
 * always said; the type and `code` exist so a caller can tell "the store is
 * gone" from a store that answered with an error.
 *
 * A run reads it at its end (t258): a run whose store went away records what
 * it still can -- its session lives outside the store -- and ends failed with
 * its own reason, rather than throwing the store's absence at its caller.
 */
export class AutomationStudioProjectStoreUnavailableError extends Error {
  readonly code = CODE;

  /** Whether `error`, or an error it was caused by, says the project store is unavailable. */
  static is(error: unknown): boolean {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
      if (current instanceof AutomationStudioProjectStoreUnavailableError || (current as { code?: unknown }).code === CODE) return true;
      current = (current as { cause?: unknown }).cause;
    }
    return false;
  }
}
