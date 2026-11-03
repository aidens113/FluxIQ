import type { ExecutionCallbackCall } from "../../execution-observation/index.ts";
import { prepareObservedExecutionCallback } from "../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "./options.ts";

/** A Core decorator invokes the original inner method with the same original raw tuple. */
export async function invokeModelExecutionDelegate<TReceiver, TArguments extends unknown[], TResult>(execution: ModelExecutionOptions | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, carrier?: object, signal?: AbortSignal): Promise<Awaited<TResult>> {
  if (!execution?.observation) return await call.callback.apply(call.receiver, call.args);
  const owned = await prepareObservedExecutionCallback(execution.observation, call, signal);
  if (carrier) owned.bindCarrier(carrier);
  let outcome: { readonly ok: true; readonly value: Awaited<TResult> } | { readonly ok: false; readonly error: unknown };
  try { outcome = { ok: true, value: await owned.invoke() }; }
  catch (error) { outcome = { ok: false, error }; }
  if (owned.completion() !== "settled" && owned.completion() !== "unknown") owned.unknown();
  try { await owned.flush(); }
  catch (cleanup) {
    if (!outcome.ok) throw new AggregateError([outcome.error, cleanup], "model.execution.delegate_cleanup_failed");
    throw cleanup;
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
