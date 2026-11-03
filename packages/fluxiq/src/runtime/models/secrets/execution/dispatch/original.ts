import { prepareObservedExecutionCallback, type ExecutionCallbackCall } from "../../../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "../../../execution/index.ts";
import { SecretProviderKeyCompletionUnknownError } from "./unknown.ts";

/** A secret owner must settle this actual delegate before it can call another. */
export async function invokeSessionProviderKeyCallback<TReceiver, TArguments extends unknown[], TResult>(execution: ModelExecutionOptions | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
  if (!execution?.observation) return await call.callback.apply(call.receiver, call.args);
  const owned = await prepareObservedExecutionCallback(execution.observation, call);
  let outcome: { ok: true; value: Awaited<TResult> } | { ok: false; error: unknown };
  try { outcome = { ok: true, value: await owned.invoke() }; }
  catch (error) { outcome = { ok: false, error }; }
  const settled = owned.completion() === "settled";
  const cleanupErrors: unknown[] = [];
  try {
    if (!settled && owned.completion() !== "unknown") owned.unknown();
  } catch (cleanup) { cleanupErrors.push(cleanup); }
  try { await owned.flush(); }
  catch (cleanup) { cleanupErrors.push(cleanup); }
  if (cleanupErrors.length && !outcome.ok) throw new AggregateError([outcome.error, ...cleanupErrors], "model.secret.delegate_cleanup_failed");
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "model.secret.delegate_cleanup_failed");
  if (!outcome.ok) throw outcome.error;
  if (!settled) throw new SecretProviderKeyCompletionUnknownError();
  return outcome.value;
}
