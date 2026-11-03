import type { ConfiguredExecutionSource, ExecutionEntry, ExecutionObservationContext, ExecutionOriginRecord, ExecutionScope, ExecutionSourcePorts, ExecutionSourceRegistration, VerifiedExecutionEvidence } from "../execution-admission/index.ts";
import type { ExecutionCallbackCall, ExecutionCallbackCompletionState, ExecutionCallbackIdentity, ExecutionCallbackObservation, ExecutionCallbackOutcome, ExecutionCallbackSettlement, ManagedExecutionCallbackRegistration, PreparedExecutionCallback } from "./contracts/index.ts";
import { ExecutionObservationBindings } from "./bindings.ts";

type Identity = { receiver: unknown; callback: object; binding: object | undefined };
type Contract = Identity & { pure: boolean; consume?: (invocation: object, outcome: ExecutionCallbackOutcome<unknown>, returned: unknown) => ExecutionCallbackSettlement | null };
type Invocation = {
  owner: ExecutionObservationSource;
  handle: PreparedExecutionCallback;
  origin: object;
  parent: ExecutionObservationContext;
  entry: ExecutionEntry | undefined;
  identity: Identity;
  contract: Contract | undefined;
  state: ExecutionCallbackCompletionState;
  started: boolean;
  interrupted: boolean;
  gap: boolean;
  terminal: boolean;
  children: Set<Invocation>;
  outcome: ExecutionCallbackOutcome<unknown> | undefined;
  returned?: unknown;
};

const entered = new WeakMap<ExecutionEntry, Invocation>();

/** Actual configured producer; it owns proofs, never command truth or a retry exception. */
export class ExecutionObservationSource implements ConfiguredExecutionSource {
  readonly owner: object = this;
  private readonly invocations = new WeakMap<object, Invocation>();
  private readonly origins = new WeakMap<object, ExecutionOriginRecord>();
  private readonly proofs = new WeakMap<object, { origin: object; evidence: VerifiedExecutionEvidence }>();
  private readonly contracts: Contract[] = [];
  private readonly used: Identity[] = [];
  private readonly errors: unknown[] = [];
  private readonly background = new Set<Promise<unknown>>();
  private configured: ExecutionSourceRegistration | undefined;
  private ports: ExecutionSourcePorts | undefined;

  constructor(private readonly scope: ExecutionScope, private readonly sourceKey: string) {}

  registration(delegatesTo: readonly object[]): ExecutionSourceRegistration {
    if (this.configured) throw new Error("execution_observation.registration_already_created");
    this.configured = Object.freeze({
      owner: this.owner, scope: this.scope, sourceKey: this.sourceKey, delegatesTo: Object.freeze([...delegatesTo]), rootPolicy: Object.freeze({ kind: "ordinary" as const }),
      readOrigin: (origin: object) => this.origins.get(origin) ?? null,
      readOrdinaryAdmission: () => null,
      consumeEvidence: (origin: object, proof: object) => {
        const value = this.proofs.get(proof);
        this.proofs.delete(proof);
        return value?.origin === origin ? value.evidence : null;
      }
    });
    return this.configured;
  }

  connect(ports: ExecutionSourcePorts): void {
    if (!this.configured || this.ports) throw new Error("execution_observation.invalid_connection");
    this.ports = ports;
  }

  forParent(parent: ExecutionObservationContext): ExecutionCallbackObservation {
    return ExecutionObservationBindings.create(this, parent);
  }

  /** Absence is pre-entry only; an entered foreign/mismatched parent stays invalid. */
  hasFrame(observation: ExecutionCallbackObservation): boolean {
    const observed = ExecutionObservationBindings.read(observation);
    if (observed.source !== this) throw new Error("execution_observation.foreign_binding");
    if (!entered.has(observed.parent.parent)) return false;
    const frame = this.frame(observation);
    if (frame.state !== "pending" || frame.terminal || frame.interrupted || frame.outcome !== undefined) throw new Error("execution_observation.frame_inactive");
    return true;
  }

  manage<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): void {
    const identity = this.identity(registration);
    if (this.used.some(value => this.same(value, identity)) || this.contracts.some(value => this.same(value, identity))) throw new Error("execution_observation.contract_already_bound");
    if (registration.contract === "no_direct_effects") {
      this.contracts.push({ ...identity, pure: true });
    } else {
      const consume = registration.consumeCompletion.bind(registration);
      this.contracts.push({ ...identity, pure: false, consume: (invocation, outcome, returned) => consume({ invocation, outcome: outcome as ExecutionCallbackOutcome<Awaited<TResult>>, returned: returned as TResult | undefined }) });
    }
  }

  isManaged(identity: { readonly receiver: unknown; readonly callback: object; readonly binding?: object }): boolean {
    return this.contracts.some(value => this.same(value, { receiver: identity.receiver, callback: identity.callback, binding: identity.binding }));
  }

  isReadOnly(identity: { readonly receiver: unknown; readonly callback: object; readonly binding?: object }): boolean {
    return this.contracts.some(value => value.pure && this.same(value, { receiver: identity.receiver, callback: identity.callback, binding: identity.binding }));
  }

  async prepare<TReceiver, TArguments extends unknown[], TResult>(observation: ExecutionCallbackObservation, identityInput: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>, signal?: AbortSignal, provenance: Omit<ExecutionOriginRecord, "sourceKey" | "operationKey"> = {}): Promise<PreparedExecutionCallback> {
    const observed = ExecutionObservationBindings.read(observation);
    if (observed.source !== this) throw new Error("execution_observation.foreign_binding");
    const parent = observed.parent;
    const identity = this.identity(identityInput);
    const ports = this.connected();
    const contract = this.contracts.find(value => this.same(value, identity));
    this.used.push(identity);
    const origin = Object.freeze({});
    this.origins.set(origin, Object.freeze({ ...provenance, sourceKey: this.sourceKey, operationKey: globalThis.crypto.randomUUID() }));
    const handle = Object.freeze({}) as PreparedExecutionCallback;
    const state: Invocation = { owner: this, handle, origin, parent, entry: undefined, identity, contract, state: "pending", started: false, interrupted: false, gap: false, terminal: false, children: new Set(), outcome: undefined };
    this.invocations.set(handle, state);
    entered.get(parent.parent)?.children.add(state);
    state.entry = await ports.producer.enter(parent, origin, signal);
    entered.set(state.entry, state);
    return handle;
  }

  async invoke<TReceiver, TArguments extends unknown[], TResult>(handle: PreparedExecutionCallback, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
    const state = this.invocation(handle);
    const callback = call.callback;
    const receiver = call.receiver;
    const identity: Identity = { receiver, callback, binding: call.binding };
    if (state.started || !this.same(state.identity, identity)) throw new Error("execution_observation.invocation_mismatch");
    state.started = true;
    // Copying the tuple preserves its positions/types and pins values before any await.
    const args = [...call.args] as TArguments;
    let outcome: ExecutionCallbackOutcome<Awaited<TResult>>;
    try {
      const returned = callback.apply(receiver, args);
      state.returned = returned;
      outcome = { kind: "fulfilled", value: await returned };
    } catch (error) {
      outcome = { kind: "rejected", error };
    }
    state.outcome = outcome;
    try {
      await this.refresh(state);
      await this.complete(state, outcome);
    } catch (error) {
      state.state = "unknown";
      this.errors.push(error);
      if (outcome.kind === "fulfilled") throw error;
    }
    if (outcome.kind === "rejected") throw outcome.error;
    return outcome.value;
  }

  /** No live reservation or completion credit: only an original registered pure method. */
  async invokeReadOnly<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal): Promise<Awaited<TResult>> {
    return await this.invokeReadOnlySync(call, signal);
  }

  /** Same original pure binding, preserving a synchronous caller's return timing. */
  invokeReadOnlySync<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal): TResult {
    const callback = call.callback;
    const receiver = call.receiver;
    const identity: Identity = { receiver, callback, binding: call.binding };
    if (!this.contracts.some(value => value.pure && this.same(value, identity))) throw new Error("execution_observation.readonly_contract_missing");
    if (signal?.aborted) throw new Error("execution_observation.aborted");
    const args = [...call.args] as TArguments;
    return callback.apply(receiver, args);
  }

  context(handle: PreparedExecutionCallback): ExecutionObservationContext {
    const state = this.invocation(handle);
    return Object.freeze({ reservation: state.parent.reservation, parent: state.entry! });
  }

  completion(handle: PreparedExecutionCallback): ExecutionCallbackCompletionState {
    return this.invocation(handle).state;
  }

  operation(handle: object): ExecutionOriginRecord {
    return this.origins.get(this.invocation(handle).origin)!;
  }

  /** Re-evaluate only the fixed original completion owner and retained actual outcome. */
  async recheck(handle: PreparedExecutionCallback): Promise<ExecutionCallbackCompletionState> {
    const state = this.invocation(handle);
    if (!state.contract?.consume || !state.outcome || state.terminal || state.state === "settled") throw new Error("execution_observation.recheck_unavailable");
    await this.complete(state, state.outcome, true);
    return state.state;
  }

  async interrupt(handle: PreparedExecutionCallback, reason: "aborted" | "timed_out" | "callback_threw" | "observer_failed"): Promise<void> {
    const state = this.invocation(handle);
    state.interrupted = true;
    state.state = "unknown";
    await this.connected().producer.interrupted(state.entry!, reason);
  }

  frameCompletion(handle: object, requiredDescendantOwner?: object): ExecutionCallbackSettlement | null {
    const state = this.invocation(handle);
    if (state.terminal) return { disposition: "unknown", code: "execution.frame.outcome_unknown" };
    if (state.gap || [...state.children].some(child => child.state !== "settled")) return null;
    if (requiredDescendantOwner) {
      const pending = [...state.children], seen = new Set<Invocation>();
      let found = false;
      while (pending.length) {
        const child = pending.pop()!;
        if (seen.has(child)) continue;
        seen.add(child);
        if (child.owner.owner === requiredDescendantOwner && child.owner.scope === this.scope && child.parent.reservation === state.parent.reservation) found = true;
        pending.push(...child.children);
      }
      if (!found) return null;
    }
    return { disposition: "settled", completionDigest: "canonical.frame.completed", assessmentDigest: "canonical.frame.children_accounted" };
  }

  unverified(handle: PreparedExecutionCallback): void {
    this.invocation(handle).gap = true;
  }

  unknown(handle: PreparedExecutionCallback): void {
    const state = this.invocation(handle);
    state.terminal = true;
    state.state = "unknown";
    this.retain(this.connected().producer.observe(state.entry!, this.proof(state, { kind: "terminal_unknown", code: "execution.frame.outcome_unknown" })));
  }

  invokeSync<TReceiver, TArguments extends unknown[], TResult>(observation: ExecutionCallbackObservation, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
    const frame = this.frame(observation);
    const callback = call.callback;
    const receiver = call.receiver;
    const identity: Identity = { receiver, callback, binding: call.binding };
    const contract = this.contracts.find(value => this.same(value, identity));
    const supported = contract?.pure === true;
    if (frame.terminal) throw new Error("execution_observation.frame_outcome_unknown");
    if (!supported) frame.gap = true;
    const args = [...call.args] as TArguments;
    try {
      return callback.apply(receiver, args);
    } catch (error) {
      if (!supported) {
        frame.terminal = true;
        frame.state = "unknown";
        frame.owner.retain(frame.owner.connected().producer.observe(frame.entry!, frame.owner.proof(frame, { kind: "terminal_unknown", code: "execution.callback.outcome_unknown" })));
      }
      throw error;
    }
  }

  /** An owner may fence its actual entered frame without manufacturing a prepared handle. */
  markFrameUnknown(observation: ExecutionCallbackObservation): void {
    const frame = this.frame(observation);
    if (!frame.terminal) frame.owner.unknown(frame.handle);
  }

  async flush(): Promise<void> {
    await Promise.allSettled([...this.background]);
    if (this.errors.length) throw new AggregateError([...this.errors], "execution_observation.cleanup_failed");
  }

  private async complete(state: Invocation, outcome: ExecutionCallbackOutcome<unknown>, rechecking = false): Promise<void> {
    const ports = this.connected();
    if (state.interrupted && !rechecking) return;
    const completion = state.contract?.pure
      ? !state.terminal && !state.gap && [...state.children].every(child => child.state === "settled")
        ? { disposition: "unacted" as const, completionDigest: "trusted.no_direct_effects", assessmentDigest: "trusted.no_direct_effects" }
        : null
      : state.contract?.consume?.(state.handle, outcome, state.returned);
    if (completion) {
      if (completion.disposition === "pending") {
        state.state = "pending";
        await ports.producer.interrupted(state.entry!, completion.reason);
        return;
      }
      if (completion.disposition === "unknown") {
        state.terminal = true;
        state.state = "unknown";
        await ports.producer.observe(state.entry!, this.proof(state, { kind: "terminal_unknown", code: completion.code }));
        return;
      }
      const proof = this.proof(state, { kind: "coverage_complete", ...completion });
      await ports.producer.finish(state.entry!, proof);
      state.state = "settled";
      return;
    }
    if (outcome.kind === "fulfilled") {
      await ports.producer.observe(state.entry!, this.proof(state, { kind: "returned_unverified", completionDigest: "callback.returned_without_completion_contract" }));
      state.state = "unverified";
    } else {
      state.state = state.contract ? "pending" : "unknown";
      if (state.contract) await ports.producer.interrupted(state.entry!, "callback_threw");
      else {
        state.terminal = true;
        await ports.producer.observe(state.entry!, this.proof(state, { kind: "terminal_unknown", code: "execution.callback.outcome_unknown" }));
      }
    }
  }

  private proof(state: Invocation, evidence: VerifiedExecutionEvidence): object {
    const proof = Object.freeze({});
    this.proofs.set(proof, { origin: state.origin, evidence });
    return proof;
  }

  private async refresh(state: Invocation): Promise<void> {
    for (const child of state.children) {
      await child.owner.refresh(child);
      if (child.contract?.consume && child.outcome && !child.terminal && !child.interrupted && child.state !== "settled") {
        await child.owner.complete(child, child.outcome, true);
      }
    }
  }

  private retain(operation: Promise<unknown>): void {
    const retained = operation.catch(error => {
      this.errors.push(error);
      return error;
    });
    this.background.add(retained);
    void retained.then(() => this.background.delete(retained));
  }

  private connected(): ExecutionSourcePorts {
    if (!this.ports) throw new Error("execution_observation.source_not_connected");
    return this.ports;
  }

  private frame(observation: ExecutionCallbackObservation): Invocation {
    const observed = ExecutionObservationBindings.read(observation);
    const frame = observed.source === this && entered.get(observed.parent.parent);
    if (!frame || frame.owner.scope !== this.scope || frame.parent.reservation !== observed.parent.reservation) throw new Error("execution_observation.durable_frame_missing");
    if (frame.owner !== this && !frame.owner.configured?.delegatesTo.includes(this.owner)) throw new Error("execution_observation.delegation_refused");
    return frame;
  }

  private invocation(handle: object): Invocation {
    const state = this.invocations.get(handle);
    if (!state) throw new Error("execution_observation.foreign_invocation");
    return state;
  }

  private identity<TReceiver, TArguments extends unknown[], TResult>(value: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): Identity {
    const callback = value.callback;
    if (typeof callback !== "function") throw new Error("execution_observation.invalid_callback");
    return { receiver: value.receiver, callback, binding: value.binding };
  }

  private same(first: Identity, second: Identity): boolean {
    return first.receiver === second.receiver && first.callback === second.callback && first.binding === second.binding;
  }
}
