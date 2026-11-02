import { ClientGatewayCommandContext } from "../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionObservationContext, ExecutionScope } from "../../../execution-admission/index.ts";
import { ExecutionRetrySeriesOwner, ExecutionBackendAttempts, type ExecutionObservationSource, type PreparedExecutionCallback, type ExecutionRetrySeries } from "../../../execution-observation/index.ts";
import type { OutputInvocationOrigin } from "../origin.ts";
import type { OutputExecutionObservation } from "../observation.ts";
import type { OutputExecutionAdmissionOptions } from "../options.ts";
import type { PreparedOutputInvocation } from "./prepared.ts";

type Operation = { readonly prepared: PreparedExecutionCallback; readonly parent: ExecutionObservationContext; readonly origin: OutputInvocationOrigin | undefined; readonly receiver: unknown; readonly callback: object; readonly binding: object | undefined; readonly series: ExecutionRetrySeries; context: ClientGatewayCommandContext | undefined };

export class OutputAdmissionState {
  static readonly observations = new WeakMap<object, { readonly state: OutputAdmissionState; readonly parent: ExecutionObservationContext; readonly origin: OutputInvocationOrigin | undefined; readonly series: ExecutionRetrySeries }>();
  static readonly invocations = new WeakMap<object, { readonly state: OutputAdmissionState; readonly operation: Operation }>();
  readonly prepared = new WeakMap<object, Operation>();
  readonly targets = new WeakMap<object, WeakSet<object>>();
  readonly gateway: ((parent: ExecutionObservationContext, provenance: object, context?: ClientGatewayCommandContext) => Promise<ClientGatewayCommandContext>) | undefined;
  readonly provenanceReader;
  readonly readCompletion;
  readonly series: ExecutionRetrySeriesOwner;
  readonly backends: ExecutionBackendAttempts;
  constructor(readonly source: ExecutionObservationSource, options: OutputExecutionAdmissionOptions, scope: ExecutionScope) {
    this.series = new ExecutionRetrySeriesOwner(scope);
    this.backends = new ExecutionBackendAttempts(scope, source);
    for (const target of options.gatewayTargets ?? []) this.markTarget(target.receiver, target.callback);
    this.gateway = options.gateway?.bind.bind(options.gateway);
    this.readCompletion = options.gateway?.readCompletion?.bind(options.gateway);
    this.provenanceReader = Object.freeze({ read: (proof: object, parent: ExecutionObservationContext) => this.read(proof, parent) });
  }
  isGatewayTarget(receiver: unknown, callback: object): boolean {
    return typeof receiver === "object" && receiver !== null && this.targets.get(receiver)?.has(callback) === true;
  }

  completion(invocation: object) {
    const operation = this.prepared.get(invocation);
    if (!operation?.context || !this.readCompletion) return null;
    const completion = this.readCompletion(operation.context, operation.parent);
    if (completion === "unknown") return { disposition: "unknown" as const, code: "execution.gateway.coverage_unknown" };
    return completion === "settled" ? this.source.frameCompletion(invocation) : null;
  }
  markTarget(receiver: object, callback: object): void {
    let callbacks = this.targets.get(receiver);
    if (!callbacks) {
      callbacks = new WeakSet();
      this.targets.set(receiver, callbacks);
    }
    callbacks.add(callback);
  }
  forParent(parent: ExecutionObservationContext, origin?: OutputInvocationOrigin, retrySeries?: ExecutionRetrySeries): OutputExecutionObservation {
    const observation = Object.freeze({}) as OutputExecutionObservation;
    const run = origin?.run;
    const read = run?.reader.readOrdinaryRunBinding.bind(run.reader);
    const pinned = origin ? Object.freeze({ invocationId: origin.invocationId, attemptId: origin.attemptId, effectOrdinal: origin.effectOrdinal,
      ...(origin.commandContext ? { commandContext: origin.commandContext } : {}),
      ...(run && read ? { run: Object.freeze({ proof: run.proof, reader: Object.freeze({ readOrdinaryRunBinding: read }) }) } : {}) }) : undefined;
    OutputAdmissionState.observations.set(observation, { state: this, parent: Object.freeze({ reservation: parent.reservation, parent: parent.parent }), origin: pinned, series: retrySeries ?? this.series.forInvocation(observation) });
    return observation;
  }
  operation(handle: PreparedOutputInvocation): Operation {
    const state = OutputAdmissionState.invocations.get(handle);
    if (!state || state.state !== this) throw new Error("execution_observation.foreign_output_invocation");
    return state.operation;
  }
  private read(proof: object, parent: ExecutionObservationContext): ReturnType<typeof ClientGatewayCommandContext.owner> | null {
    const state = OutputAdmissionState.invocations.get(proof);
    if (!state || state.state !== this || state.operation.parent.parent !== parent.parent || state.operation.parent.reservation !== parent.reservation) return null;
    const operation = state.operation;
    const existing = operation.context ?? operation.origin?.commandContext;
    if (existing) return ClientGatewayCommandContext.owner(existing);
    const origin = operation.origin;
    if (!origin?.run) return null;
    const run = origin.run.reader.readOrdinaryRunBinding(origin.run.proof, parent);
    if (!run) return null;
    return Object.freeze({ projectId: run.owner.projectId, runId: run.owner.runId, flowId: run.owner.flowId, invocationId: origin.invocationId, attemptId: origin.attemptId, effectOrdinal: origin.effectOrdinal });
  }
}
