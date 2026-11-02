import type { ExecutionCallbackCall } from "../contracts/index.ts";
import type { ExecutionCallbackRootLifecycle } from "./lifecycle.ts";

/** A typed original invocation; unsupported completion never becomes a closed root. */
export async function invokeExecutionCallbackRoot<TReceiver, TArguments extends unknown[], TResult>(
  lifecycle: ExecutionCallbackRootLifecycle,
  call: ExecutionCallbackCall<TReceiver, TArguments, TResult>,
  signal?: AbortSignal
): Promise<Awaited<TResult>> {
  const binding = call.binding;
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(binding ? { binding } : {}) };
  const { callbacks, reserve, finish, unverified, interrupted, release, prepared: bindPrepared } = lifecycle;
  const reserved = await reserve.call(lifecycle, signal);
  let primaryFailure: { error: unknown } | undefined;
  try {
    const observed = callbacks.forParent({ reservation: reserved.reservation, parent: reserved.root });
    const prepared = await callbacks.prepare(observed, pinned, signal);
    if (bindPrepared) await bindPrepared.call(lifecycle, callbacks.context(prepared), reserved.root);
    const result = await callbacks.invoke(prepared, pinned);
    await callbacks.flush();
    if (callbacks.completion(prepared) === "settled") await finish.call(lifecycle, reserved.root);
    else await unverified.call(lifecycle, reserved.root);
    return result;
  } catch (error) {
    primaryFailure = { error };
    try { await interrupted.call(lifecycle, reserved.root, "observer_failed"); }
    catch (persistenceError) { primaryFailure.error = new AggregateError([error, persistenceError], "execution_observation.root_interruption_failed"); }
    throw primaryFailure.error;
  } finally {
    try { await release.call(lifecycle, reserved.reservation); }
    catch (releaseError) {
      if (primaryFailure) throw new AggregateError([primaryFailure.error, releaseError], "execution_observation.root_release_failed");
      throw releaseError;
    }
  }
}
