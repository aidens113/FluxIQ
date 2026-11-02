import type { ExecutionObservationContext, ExecutionScope, ExecutionSourcePorts } from "../../execution-admission/index.ts";
import { ExecutionObservationSource, type ExecutionRetrySeries, type ManagedExecutionCallbackRegistration } from "../../execution-observation/index.ts";
import type { OutputExecutionAdmissionSource } from "./port.ts";
import type { OutputExecutionAdmissionOptions } from "./options.ts";
import type { OutputInvocationOrigin } from "./origin.ts";
import { OutputAdmissionState } from "./internal/index.ts";

export function createOutputExecutionAdmissionSource(scope: ExecutionScope, options: OutputExecutionAdmissionOptions = {}): OutputExecutionAdmissionSource {
  const source = new ExecutionObservationSource(scope, "runtime.output");
  const state = new OutputAdmissionState(source, options, scope);
  return Object.freeze({
    owner: source.owner,
    provenanceReader: state.provenanceReader,
    registration: (delegatesTo: readonly object[]) => source.registration(delegatesTo),
    connect: (ports: ExecutionSourcePorts) => source.connect(ports),
    forParent: (parent: ExecutionObservationContext, origin?: OutputInvocationOrigin, retrySeries?: ExecutionRetrySeries) => state.forParent(parent, origin, retrySeries),
    manage: <TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>) => source.manage(registration),
    markGatewayTarget: (target: object, callback: object) => state.markTarget(target, callback),
    flush: () => source.flush()
  });
}
