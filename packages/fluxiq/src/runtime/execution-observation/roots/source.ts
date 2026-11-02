import { invokeExecutionCallbackRoot } from "./invoke.ts";
import type { ConfiguredExecutionSource, ExecutionAdmissionConsumer, ExecutionScope, ExecutionOriginRecord, ExecutionSourcePorts, ExecutionSourceRegistration, VerifiedExecutionEvidence } from "../../execution-admission/index.ts";
import type { ExecutionCallbackCall } from "../contracts/index.ts";
import type { ExecutionObservationSource } from "../source.ts";
import type { ExecutionCallbackRootPreparation } from "./preparation.ts";

/** The original configured callback call owns a root; the invoked callback owns its child evidence. */
export class ExecutionCallbackRootSource implements ConfiguredExecutionSource {
  readonly owner: object = this;
  private readonly origins = new WeakMap<object, ExecutionOriginRecord>();
  private readonly admissions = new WeakMap<object, { origin: object; callKey: string }>();
  private readonly evidence = new WeakMap<object, { origin: object; value: VerifiedExecutionEvidence }>();
  private ports: ExecutionSourcePorts | undefined;
  private configured = false;

  constructor(
    private readonly scope: ExecutionScope,
    private readonly consumer: ExecutionAdmissionConsumer,
    private readonly callbacks: ExecutionObservationSource,
    private readonly sourceKey: string
  ) {}

  registration(delegatesTo: readonly object[]): ExecutionSourceRegistration {
    if (this.configured || !delegatesTo.includes(this.callbacks.owner)) throw new Error("execution_observation.root_source_invalid");
    this.configured = true;
    return Object.freeze({
      owner: this.owner, scope: this.scope, sourceKey: this.sourceKey,
      delegatesTo: Object.freeze([...delegatesTo]), rootPolicy: Object.freeze({ kind: "ordinary" as const }),
      readOrigin: (origin: object) => this.origins.get(origin) ?? null,
      readOrdinaryAdmission: (proof: object) => {
        const value = this.admissions.get(proof);
        this.admissions.delete(proof);
        return value ?? null;
      },
      consumeEvidence: (origin: object, proof: object) => {
        const value = this.evidence.get(proof);
        this.evidence.delete(proof);
        return value?.origin === origin ? value.value : null;
      }
    });
  }

  connect(ports: ExecutionSourcePorts): void {
    if (!this.configured || this.ports) throw new Error("execution_observation.root_source_rebound");
    this.ports = ports;
  }

  async invoke<TReceiver, TArguments extends unknown[], TResult>(
    call: ExecutionCallbackCall<TReceiver, TArguments, TResult>,
    signal?: AbortSignal,
    preparationOwner?: ExecutionCallbackRootPreparation
  ): Promise<Awaited<TResult>> {
    const prepare = preparationOwner?.prepared;
    const prepared = prepare?.bind(preparationOwner);
    const ports = this.connected();
    const origin = Object.freeze({}), invocationId = globalThis.crypto.randomUUID();
    this.origins.set(origin, Object.freeze({ sourceKey: this.sourceKey, operationKey: invocationId, invocationId }));
    const proof = Object.freeze({});
    this.admissions.set(proof, { origin, callKey: invocationId });
    return await invokeExecutionCallbackRoot({
      callbacks: this.callbacks,
      reserve: signal => this.consumer.reserve(this.scope, ports.issuer.fromOrdinaryAdmission(proof), signal),
      finish: root => ports.producer.finish(root, this.proof(origin, {
        kind: "coverage_complete", disposition: "unacted", completionDigest: invocationId,
        assessmentDigest: "execution.callback.root.children_accounted"
      })),
      unverified: root => ports.producer.observe(root, this.proof(origin, { kind: "returned_unverified", completionDigest: invocationId })),
      interrupted: (root, reason) => ports.producer.interrupted(root, reason),
      release: reservation => this.consumer.release(reservation),
      ...(prepared ? { prepared } : {})
    }, call, signal);
  }

  private proof(origin: object, value: VerifiedExecutionEvidence): object {
    const proof = Object.freeze({});
    this.evidence.set(proof, { origin, value });
    return proof;
  }

  private connected(): ExecutionSourcePorts {
    if (!this.ports) throw new Error("execution_observation.root_source_not_connected");
    return this.ports;
  }
}
