import type { OutputDispatchIo } from "../ports/index.ts";
import type { RegisteredOutputAction } from "../action.ts";
import type { ConfirmationOutcome } from "./outcome.ts";
export function awaitConfirmation(io: OutputDispatchIo, domainId: string | null | undefined, action: RegisteredOutputAction, signal: AbortSignal | undefined): Promise<ConfirmationOutcome> | null {
  if (!action.confirmationInputId)
    return null;
  return io.waitForInput({ domainId: domainId ?? null, inputId: action.confirmationInputId, ...(action.confirmationTimeoutMs !== undefined ? { timeoutMs: action.confirmationTimeoutMs } : {}), ...(signal ? { signal } : {}) })
    .then((): ConfirmationOutcome => ({ ok: true }))
    .catch((error: unknown): ConfirmationOutcome => ({ ok: false, error: error instanceof Error ? error.message : "Output confirmation failed.", cancelled: signal?.aborted === true }));
}
