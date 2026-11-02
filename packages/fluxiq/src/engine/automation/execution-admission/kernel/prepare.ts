import type { ExecutionCallbackIdentity } from "../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { AutomationAdmissionDriver } from "../internal/index.ts";
import type { AutomationExecutionKernel } from "./handle.ts";
import type { PreparedAutomationFrame } from "./frame.ts";
import { AutomationKernelState } from "./state.ts";

export async function prepareAutomationFrame<TReceiver, TArguments extends unknown[], TResult>(options: AutomationStudioGraphExecutionOptions, identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>, kernel: AutomationExecutionKernel): Promise<PreparedAutomationFrame | undefined> {
  const observation = AutomationObservationBindings.of(options);
  if (!observation) return undefined;
  const source = AutomationObservationBindings.read(observation).source;
  if (!(source instanceof AutomationAdmissionDriver)) throw new Error("execution_observation.foreign_automation_source");
  const original = AutomationKernelState.read(kernel);
  if (identity.callback !== original.callback || identity.receiver !== original.receiver) throw new Error("execution_observation.kernel_mismatch");
  return await source.prepare(options, identity, kernel, original.kind);
}
