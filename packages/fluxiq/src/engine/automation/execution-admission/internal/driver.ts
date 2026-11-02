import type { ExecutionObservationContext, ExecutionScope, ExecutionSourcePorts } from "../../../../runtime/execution-admission/index.ts";
import { ExecutionObservationSource, ExecutionRetrySeriesOwner, ExecutionBackendAttempts, type ExecutionCallbackIdentity, type ManagedExecutionCallbackRegistration, type PreparedExecutionCallback } from "../../../../runtime/execution-observation/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../../runtime/output-dispatch/admission/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import type { AutomationExecutionAdmissionSource } from "../port.ts";
import type { AutomationExecutionAdmissionCollaborators } from "../collaborators.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { hasUnsupportedAutomationCallbacks } from "./coverage.ts";
import { AutomationPureCallbacks } from "../kernel/pure.ts";
import { AutomationOrchestrationCallbacks } from "../kernel/orchestration.ts";
import { copyAutomationExecutionOptions } from "../copy.ts";

export class AutomationAdmissionDriver implements AutomationExecutionAdmissionSource {
  readonly callbacks: ExecutionObservationSource;
  readonly series: ExecutionRetrySeriesOwner;
  readonly backends: ExecutionBackendAttempts;
  private readonly kernels = new Set<object>();
  constructor(scope: ExecutionScope, readonly collaborators: AutomationExecutionAdmissionCollaborators) {
    this.callbacks = new ExecutionObservationSource(scope, "automation.engine");
    this.series = new ExecutionRetrySeriesOwner(scope);
    this.backends = new ExecutionBackendAttempts(scope, this.callbacks);
  }
  get owner(): object { return this.callbacks.owner; }
  registration(delegatesTo: readonly object[]) { return this.callbacks.registration(delegatesTo); }
  connect(ports: ExecutionSourcePorts): void { this.callbacks.connect(ports); }
  forParent(parent: ExecutionObservationContext) { return AutomationObservationBindings.create(this, parent); }
  forRun(parent: ExecutionObservationContext, proof: object, reader: OrdinaryExecutionRunBindingReader) {
    const read = reader.readOrdinaryRunBinding.bind(reader);
    if (!read(proof, parent)) throw new Error("execution_observation.run_binding_unverified");
    return AutomationObservationBindings.create(this, parent, { proof, reader: Object.freeze({ readOrdinaryRunBinding: read }) });
  }
  manage<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): void { this.callbacks.manage(registration); }
  ensurePure<TReceiver, TArguments extends unknown[], TResult>(identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): void {
    if (this.callbacks.isManaged(identity)) return;
    if (AutomationOrchestrationCallbacks.has(identity.callback)) this.callbacks.manage({ ...identity, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => this.callbacks.frameCompletion(invocation) });
    else if (AutomationPureCallbacks.has(identity.receiver, identity.callback)) this.callbacks.manage({ ...identity, contract: "no_direct_effects" });
  }
  flush(): Promise<void> { return this.callbacks.flush(); }
  async prepare<TReceiver, TArguments extends unknown[], TResult>(options: AutomationStudioGraphExecutionOptions, identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>, kernel: object, kind: "graph" | "attempt" | "children"): Promise<{ driver: AutomationAdmissionDriver; invocation: PreparedExecutionCallback; options: AutomationStudioGraphExecutionOptions; binding: object }> {
    const observation = AutomationObservationBindings.of(options);
    if (!observation) throw new Error("execution_observation.automation_binding_missing");
    const observed = AutomationObservationBindings.read(observation);
    if (observed.source !== this) throw new Error("execution_observation.foreign_automation_binding");
    if (!this.kernels.has(kernel)) {
      this.callbacks.manage({ ...identity, binding: kernel, contract: "managed_direct_effects", consumeCompletion: ({ invocation, outcome }) => {
        if (kind === "graph" && outcome.kind === "fulfilled" && outcome.value && typeof outcome.value === "object" && "failure" in outcome.value) {
          const failure = outcome.value.failure;
          if (failure && typeof failure === "object" && "code" in failure && failure.code === "run.outcome_uncertain") return { disposition: "unknown", code: "run.outcome_uncertain" };
        }
        const completion = this.callbacks.frameCompletion(invocation);
        if (!completion && kind === "graph" && outcome.kind === "fulfilled" && outcome.value && typeof outcome.value === "object" && "status" in outcome.value && outcome.value.status === "failed") return { disposition: "unknown", code: "execution.unverified_frame.failed" };
        return completion;
      } });
      this.kernels.add(kernel);
    }
    const invocation = await this.callbacks.prepare(this.callbacks.forParent(observed.parent), { ...identity, binding: kernel }, options.signal);
    if (hasUnsupportedAutomationCallbacks(options, this.callbacks)) this.callbacks.unverified(invocation);
    const parent = this.callbacks.context(invocation);
    const placed = copyAutomationExecutionOptions(options, {}, null);
    AutomationObservationBindings.bind(placed, AutomationObservationBindings.create(this, parent, observed.run, invocation));
    return { driver: this, invocation, options: placed, binding: kernel };
  }
  callbackObservation(options: AutomationStudioGraphExecutionOptions) {
    const observation = AutomationObservationBindings.of(options);
    if (!observation) throw new Error("execution_observation.automation_binding_missing");
    const state = AutomationObservationBindings.read(observation);
    return this.callbacks.forParent(state.parent);
  }
  current(options: AutomationStudioGraphExecutionOptions): PreparedExecutionCallback | undefined {
    const observation = AutomationObservationBindings.of(options);
    return observation ? AutomationObservationBindings.read(observation).invocation : undefined;
  }
}
