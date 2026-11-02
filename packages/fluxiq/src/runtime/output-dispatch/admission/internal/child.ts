import type { OutputExecutionObservation } from "../observation.ts";
import type { PreparedOutputInvocation } from "./prepared.ts";
import { OutputAdmissionState } from "./state.ts";

export function outputInvocationChild(handle: PreparedOutputInvocation): OutputExecutionObservation {
  const observed = OutputAdmissionState.invocations.get(handle);
  if (!observed) throw new Error("execution_observation.foreign_output_invocation");
  return observed.state.forParent(observed.operation.parent, observed.operation.origin, observed.operation.series);
}
