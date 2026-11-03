import type { OwnedExecutionCallback } from "../../execution-observation/index.ts";

/** The owning producer fences unsupported fulfillment and drains its original callback bookkeeping. */
export async function invokePreparedInstructionModelRun<TReceiver, TArguments extends unknown[], TResult>(invocation: OwnedExecutionCallback<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
  const managed = invocation.isManaged();
  let primary: { error: unknown } | undefined;
  try {
    const answer = await invocation.invoke();
    if (managed) {
      const completion = invocation.completion();
      if (completion === "pending" || completion === "unverified") await invocation.recheck();
    } else invocation.unknown();
    return answer;
  } catch (error) {
    primary = { error };
    throw error;
  } finally {
    try { await invocation.flush(); }
    catch (cleanupError) {
      if (primary) throw new AggregateError([primary.error, cleanupError], "Instruction runner and observation cleanup failed.", { cause: primary.error });
      throw cleanupError;
    }
  }
}
