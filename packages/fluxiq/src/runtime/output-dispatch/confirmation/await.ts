import type { OutputDispatchIo } from "../ports/index.ts";
import type { RegisteredOutputAction } from "../action.ts";
import type { ConfirmationOutcome } from "./outcome.ts";
import { invokeObservedOutputMethod, type OutputExecutionObservation } from "../admission/internal/index.ts";
export function awaitConfirmation(io: OutputDispatchIo, domainId: string | null | undefined, action: RegisteredOutputAction, signal: AbortSignal | undefined, observation?: OutputExecutionObservation): Promise<ConfirmationOutcome> | null {
  if (!action.confirmationInputId)
    return null;
  return invokeObservedOutputMethod(observation, { receiver: io, callback: io.waitForInput, args: [{ domainId: domainId ?? null, inputId: action.confirmationInputId, ...(action.confirmationTimeoutMs !== undefined ? { timeoutMs: action.confirmationTimeoutMs } : {}), ...(signal ? { signal } : {}) }] }, signal)
    .then((): ConfirmationOutcome => ({ ok: true }))
    .catch((error: unknown): ConfirmationOutcome => ({ ok: false, error: error instanceof Error ? error.message : "Output confirmation failed.", cancelled: signal?.aborted === true }));
}
