import type { ConfiguredExecutionSource, ExecutionEntry, ExecutionObservationContext, ExecutionOriginRecord, ExecutionSourcePorts, ExecutionSourceRegistration, VerifiedExecutionEvidence } from "../../../../../runtime/execution-admission/index.ts";
import type { CandidateTrialModeOwner, CandidateTrialSourceInput } from "../contracts/index.ts";
import { AutomationStudioCandidateTrialAuthority } from "./source.ts";
import type { ExecutionCallbackIdentity } from "../../../../../runtime/execution-observation/index.ts";

/** Registered before exploration, then shared by every later candidate port on this persisted continuation. */
export class AutomationStudioCandidateTrialSource implements ConfiguredExecutionSource {
  readonly owner: object = this;
  readonly scope;
  readonly consumer;
  readonly callbacks;
  readonly automation;
  readonly toolObserver;
  private readonly prepareTools: NonNullable<CandidateTrialSourceInput["toolObserver"]>["prepareParent"] | undefined;
  private readonly toolParents = new WeakMap<object, { readonly root: ExecutionEntry; readonly preparation: Promise<void> }>();
  private readonly sourceKey: string;
  private readonly seriesKey: string;
  private readonly origins = new WeakMap<object, ExecutionOriginRecord>();
  private readonly admissions = new WeakMap<object, { origin: object; callKey: string }>();
  private readonly evidence = new WeakMap<object, { origin: object; value: VerifiedExecutionEvidence }>();
  private readonly authorities = new WeakMap<CandidateTrialModeOwner, AutomationStudioCandidateTrialAuthority>();
  private ports: ExecutionSourcePorts | undefined;
  private configured = false;
  private readonly frames: { receiver: unknown; callback: object; binding: object | undefined; requiredDescendantOwner: object | undefined }[] = [];
  private readonly readOnly: { receiver: unknown; callback: object; binding: object | undefined }[] = [];

  constructor(input: CandidateTrialSourceInput) {
    if (!input.seriesKey) throw new Error("candidate.trial_series_required");
    this.scope = input.scope;
    this.consumer = input.consumer;
    this.callbacks = input.callbacks;
    this.automation = input.automation;
    const toolObserver = input.toolObserver;
    this.toolObserver = toolObserver;
    this.prepareTools = toolObserver?.prepareParent.bind(toolObserver);
    this.seriesKey = input.seriesKey;
    this.sourceKey = `candidate.trial.${input.seriesKey}`;
  }

  registration(delegatesTo: readonly object[]): ExecutionSourceRegistration {
    if (this.configured || !delegatesTo.includes(this.callbacks.owner)) throw new Error("candidate.trial_registration_invalid");
    this.configured = true;
    return Object.freeze({
      owner: this.owner, scope: this.scope, sourceKey: this.sourceKey,
      delegatesTo: Object.freeze([...delegatesTo]), rootPolicy: Object.freeze({ kind: "trial_series" as const, seriesKey: this.seriesKey }),
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
    if (!this.configured || this.ports) throw new Error("candidate.trial_connection_invalid");
    this.ports = ports;
  }

  bind(modeOwner: CandidateTrialModeOwner): AutomationStudioCandidateTrialAuthority {
    const original = this.authorities.get(modeOwner);
    if (original) return original;
    const authority = new AutomationStudioCandidateTrialAuthority({ source: this, modeOwner });
    this.authorities.set(modeOwner, authority);
    return authority;
  }

  manageFrame<TReceiver, TArguments extends unknown[], TResult>(identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>, requiredDescendantOwner?: object): void {
    const prior = this.frames.find(frame => frame.receiver === identity.receiver && frame.callback === identity.callback && frame.binding === identity.binding);
    if (prior) {
      if (prior.requiredDescendantOwner !== requiredDescendantOwner) throw new Error("candidate.trial_frame_owner_changed");
      return;
    }
    this.callbacks.manage({ ...identity, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => this.callbacks.frameCompletion(invocation, requiredDescendantOwner) });
    this.frames.push({ receiver: identity.receiver, callback: identity.callback, binding: identity.binding, requiredDescendantOwner });
  }

  manageReadOnly<TReceiver, TArguments extends unknown[], TResult>(identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): void {
    if (this.readOnly.some(original => original.receiver === identity.receiver && original.callback === identity.callback && original.binding === identity.binding)) return;
    this.callbacks.manage({ ...identity, contract: "no_direct_effects" });
    this.readOnly.push({ receiver: identity.receiver, callback: identity.callback, binding: identity.binding });
  }

  original(operationKey: string): { readonly origin: object; readonly record: ExecutionOriginRecord } {
    const origin = Object.freeze({});
    const record = Object.freeze({ sourceKey: this.sourceKey, operationKey, invocationId: globalThis.crypto.randomUUID() });
    this.origins.set(origin, record);
    return { origin, record };
  }

  async reserve(origin: object, signal: AbortSignal) {
    const record = this.origins.get(origin);
    if (!record) throw new Error("candidate.trial_origin_foreign");
    const proof = Object.freeze({});
    this.admissions.set(proof, { origin, callKey: record.invocationId! });
    const grant = this.connected().issuer.fromOrdinaryAdmission(proof);
    return await this.consumer.reserve(this.scope, grant, signal);
  }

  async prepareToolParent(request: object, parent: ExecutionObservationContext, originalRoot: ExecutionEntry): Promise<void> {
    if (!this.prepareTools) return;
    const prior = this.toolParents.get(request);
    if (prior) {
      if (prior.root !== originalRoot) throw new Error("candidate.trial_tool_parent_rebound");
      return await prior.preparation;
    }
    const preparation = this.prepareTools(request, parent, originalRoot);
    this.toolParents.set(request, { root: originalRoot, preparation });
    await preparation;
  }

  async finish(entry: ExecutionEntry, origin: object, completionDigest: string): Promise<void> {
    const proof = Object.freeze({});
    this.evidence.set(proof, { origin, value: { kind: "coverage_complete", disposition: "unacted", completionDigest, assessmentDigest: "candidate.orchestration.children_accounted" } });
    await this.connected().producer.finish(entry, proof);
  }

  async unverified(entry: ExecutionEntry, origin: object, completionDigest: string): Promise<void> {
    if (!this.origins.has(origin)) throw new Error("candidate.trial_origin_foreign");
    const proof = Object.freeze({});
    this.evidence.set(proof, { origin, value: { kind: "returned_unverified", completionDigest } });
    await this.connected().producer.observe(entry, proof);
  }

  connected(): ExecutionSourcePorts {
    if (!this.ports) throw new Error("candidate.trial_source_not_connected");
    return this.ports;
  }
}
