import type { ExecutionCallbackObservation } from "../contracts/index.ts";
import { ExecutionObservationBindings } from "../bindings.ts";

/** Await the actual source's retained writes; absence provides no coverage. */
export async function flushObservedExecutionCallbacks(observation: ExecutionCallbackObservation | undefined): Promise<void> {
  if (observation) await ExecutionObservationBindings.read(observation).source.flush();
}
