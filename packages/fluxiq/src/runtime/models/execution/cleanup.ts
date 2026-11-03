import { flushObservedExecutionCallbacks } from "../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "./options.ts";

/** Retains the original failure when awaiting this owner's actual durable observation writes. */
export async function flushModelExecution<TResult>(actual: Promise<TResult>, execution: ModelExecutionOptions | undefined): Promise<TResult> {
  let outcome: { readonly ok: true; readonly value: TResult } | { readonly ok: false; readonly error: unknown };
  try { outcome = { ok: true, value: await actual }; }
  catch (error) { outcome = { ok: false, error }; }
  try { await flushObservedExecutionCallbacks(execution?.observation); }
  catch (cleanup) {
    if (!outcome.ok) throw new AggregateError([outcome.error, cleanup], "model.execution.cleanup_failed");
    throw cleanup;
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
