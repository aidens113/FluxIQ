import type { JsonObject } from "../../../../../core/index.ts";
import type { ExecutionObservationContext } from "../../../../../runtime/execution-admission/index.ts";
import type { ExecutionCallbackCall, ExecutionCallbackIdentity } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import type { CandidateTrialAuthorityInput } from "../contracts/index.ts";
import type { CandidateTrialAuthority } from "../contracts/index.ts";
import type { CandidateTrialCheckout } from "../contracts/index.ts";
import type { CandidateTrialCompletion } from "../contracts/index.ts";
import type { CandidateTrialCompleted } from "../contracts/index.ts";
import type { CandidateTrialInvocationPhase } from "../contracts/index.ts";
import type { CandidateTrialAuthorityState } from "./state.ts";
import { candidateTrialCompanions } from "./registry.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { CandidateTrialReceiver } from "../contracts/index.ts";
import { candidateTrialRequestKey } from "./request-key.ts";
import { isCandidateTrialFrame } from "./is-frame.ts";
import { candidateTrialFramePorts } from "./frame-ports.ts";
import type { PartialTrialContext } from "../partial/index.ts";

/** The candidate source owns only orchestration; actual callbacks and engines own their child evidence. */
export class AutomationStudioCandidateTrialAuthority implements CandidateTrialAuthority {
  readonly modeOwner;
  private readonly states = new WeakMap<object, CandidateTrialAuthorityState>();
  private readonly completed = new WeakMap<object, CandidateTrialCompleted>();
  private readonly coveredRetained = new WeakSet<object>();
  private readonly prepared = new WeakMap<object, CandidateTrialCheckout>();
  private readonly frames: { receiver: unknown; callback: object; binding: object | undefined }[] = [];

  constructor(private readonly input: CandidateTrialAuthorityInput) {
    this.modeOwner = input.modeOwner;
    const companion = candidateTrialCompanions.get(this.modeOwner.port);
    if (!companion || companion.modeOwner !== this.modeOwner || companion.authority) throw new Error("candidate.trial_authority_invalid");
    companion.authority = this;
  }

  checkout(gate: object, candidate: AutomationStudioFlowCandidate, value: JsonObject): CandidateTrialCheckout {
    const prepared = this.prepared.get(gate);
    if (prepared) {
      this.prepared.delete(gate);
      try {
        const state = this.state(prepared);
        if (state.snapshot.requestKey !== candidateTrialRequestKey(state.snapshot.candidateId, candidate, value) || state.snapshot.mode === "live" || !this.modeOwner.readOnlyLease(prepared)) throw new Error("candidate.trial_readonly_checkout_lost");
        return prepared;
      } catch (error) {
        this.modeOwner.release(prepared);
        const state = this.states.get(prepared);
        if (state) state.released = true;
        throw error;
      }
    }
    return this.record(this.modeOwner.checkout(gate, candidate, value));
  }

  private record(checkout: CandidateTrialCheckout): CandidateTrialCheckout {
    const snapshot = this.modeOwner.read(checkout);
    if (!snapshot) throw new Error("candidate.trial_checkout_lost");
    const { origin, record } = this.input.source.original(snapshot.requestKey);
    this.states.set(checkout, { checkout, snapshot, origin, record, reserved: undefined, signal: undefined, started: false, readOnly: undefined, active: undefined, invocations: [], errors: [], frameCompleted: false, trialCompleted: false, completion: undefined, released: false });
    return checkout;
  }

  read(checkout: object) { return this.states.get(checkout)?.released === false ? this.modeOwner.read(checkout) : null; }

  async reserve(checkout: CandidateTrialCheckout, signal: AbortSignal): Promise<void> {
    const state = this.state(checkout);
    if (state.started) throw new Error("candidate.trial_already_reserved");
    state.started = true;
    signal.throwIfAborted();
    state.signal = signal;
    this.input.source.connected();
    if (state.snapshot.mode === "live" && (await this.input.source.consumer.inspect(this.input.source.scope)).state !== "clear" && this.modeOwner.selectReadOnly(checkout)) {
      const selected = this.modeOwner.read(checkout);
      if (!selected) throw new Error("candidate.trial_readonly_checkout_lost");
      state.snapshot = selected;
    }
    if (state.snapshot.mode !== "live") {
      state.readOnly = this.modeOwner.readOnlyLease(checkout);
      if (!state.readOnly) throw new Error("candidate.trial_readonly_unavailable");
      return;
    }
    state.reserved = await this.input.source.reserve(state.origin, signal);
    state.active = { reservation: state.reserved.reservation, parent: state.reserved.root };
    try {
      await this.input.source.prepareToolParent(checkout, state.active, state.reserved.root);
    } catch (error) {
      try { await this.input.source.connected().producer.interrupted(state.reserved.root, "observer_failed"); }
      catch (observerError) { throw new AggregateError([error, observerError], "candidate.trial_tool_preparation_failed"); }
      throw error;
    }
  }

  observation(checkout: CandidateTrialCheckout): ExecutionObservationContext | undefined { return this.state(checkout).active; }

  executionObservation(checkout: CandidateTrialCheckout) {
    const parent = this.observation(checkout);
    return parent ? this.input.source.automation?.forParent(parent) : undefined;
  }

  callbackObservation(checkout: CandidateTrialCheckout): PartialTrialContext | undefined {
    const state = this.state(checkout);
    if (!state.active || !state.reserved || state.readOnly) return undefined;
    const source = this.input.source;
    return { parent: state.active, callbacks: source.callbacks, automation: source.automation, originalRoot: state.reserved.root, toolObserver: source.toolObserver, toolRequest: checkout, prepareToolParent: source.prepareToolParent.bind(source) };
  }

  bindFrame<TReceiver, TArguments extends unknown[], TResult>(identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): void {
    this.frames.push({ receiver: identity.receiver, callback: identity.callback, binding: identity.binding });
    this.input.source.manageFrame(identity);
  }

  async invoke<TReceiver, TArguments extends unknown[], TResult>(checkout: CandidateTrialCheckout, phase: CandidateTrialInvocationPhase, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, prepared?: (originalContext: ExecutionObservationContext) => void | Promise<void>): Promise<Awaited<TResult>> {
    const state = this.state(checkout);
    if (state.readOnly) {
      if (phase !== "frame" || !this.frames.some(frame => frame.receiver === call.receiver && frame.callback === call.callback && frame.binding === call.binding)) throw new Error("candidate.trial_readonly_callback_required");
      const readOnly = { receiver: call.receiver, callback: call.callback, args: call.args, binding: state.readOnly };
      this.input.source.manageReadOnly(readOnly);
      const answer = await this.input.source.callbacks.invokeReadOnly(readOnly, state.signal);
      await this.diagnostic(state);
      return answer;
    }
    if (!state.active) throw new Error("candidate.trial_not_reserved");
    const prior = state.active;
    const callbacks = this.input.source.callbacks;
    if (isCandidateTrialFrame(call.callback, this.input.source.automation !== undefined)) this.input.source.manageFrame(call, candidateTrialFramePorts.get(call.callback)?.automation ? this.input.source.automation?.owner : undefined);
    state.signal?.throwIfAborted();
    const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(call.binding ? { binding: call.binding } : {}) };
    const managed = callbacks.isManaged(pinned);
    const invocation = await callbacks.prepare(callbacks.forParent(prior), pinned, state.signal);
    state.invocations.push(invocation);
    state.active = callbacks.context(invocation);
    try {
      state.signal?.throwIfAborted();
      await prepared?.(state.active);
      const answer = await callbacks.invoke(invocation, pinned);
      if (!managed) callbacks.unknown(invocation);
      await callbacks.flush();
      if (phase === "trial") state.trialCompleted = true;
      if (phase === "frame") {
        state.frameCompleted = true;
        await this.finish(state);
        if (!state.completion) await this.diagnostic(state);
      }
      return answer;
    } finally { state.active = prior; }
  }

  invokeSync<TReceiver, TArguments extends unknown[], TResult>(checkout: CandidateTrialCheckout, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
    const state = this.state(checkout);
    if (state.readOnly) return this.input.source.callbacks.invokeReadOnlySync(call, state.signal);
    if (!state.active) throw new Error("candidate.trial_not_reserved");
    return this.input.source.callbacks.invokeSync(this.input.source.callbacks.forParent(state.active), call);
  }

  async invokeTrial(checkout: CandidateTrialCheckout, receiver: CandidateTrialReceiver, request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult> {
    const state = this.state(checkout);
    if (!state.readOnly) return await this.invoke(checkout, "trial", { receiver, callback: receiver.port, args: [request] });
    const call = this.modeOwner.readOnlyCall(checkout, receiver.port, receiver, request);
    if (!call || this.modeOwner.readOnlyLease(checkout) !== state.readOnly) throw new Error("candidate.trial_readonly_checkout_lost");
    if (call.kind === "owned") return await call.callbacks.invokeReadOnly(call.call, state.signal);
    if (call.call.binding !== state.readOnly) throw new Error("candidate.trial_readonly_checkout_lost");
    this.input.source.manageReadOnly(call.call);
    return await this.input.source.callbacks.invokeReadOnly(call.call, state.signal);
  }

  async canPromote(checkout: CandidateTrialCheckout): Promise<boolean> {
    const state = this.state(checkout);
    if (state.snapshot.mode === "live") return true;
    if (state.snapshot.mode !== "cached_rejudge" || !state.snapshot.retained || !this.coveredRetained.has(state.snapshot.retained)) return false;
    return (await this.input.source.consumer.inspect(this.input.source.scope)).state === "clear";
  }

  isOfflineDiagnostic(checkout: CandidateTrialCheckout): boolean {
    const state = this.state(checkout);
    return state.snapshot.mode === "offline" && state.readOnly !== undefined && state.reserved === undefined && this.modeOwner.offlineInvocationActive(checkout) && this.modeOwner.readOnlyLease(checkout) === state.readOnly;
  }

  /** Original selected mode only; this grants no callback or completion credit. */
  isReadOnlyCheckout(checkout: CandidateTrialCheckout): boolean { return this.state(checkout).readOnly !== undefined; }

  pinReadOnly(gate: object, candidate: AutomationStudioFlowCandidate, value: JsonObject, retained: object): boolean {
    if (this.prepared.has(gate)) return false;
    const pinned = this.modeOwner.checkoutReadOnly(gate, candidate, value, retained);
    if (!pinned) return false;
    const checkout = this.record(pinned);
    const state = this.state(checkout);
    if (state.snapshot.mode === "live" || state.snapshot.mode === "cached_rejudge" && state.snapshot.retained !== retained || !this.modeOwner.readOnlyLease(checkout)) {
      this.modeOwner.release(checkout);
      state.released = true;
      return false;
    }
    this.prepared.set(gate, checkout);
    return true;
  }

  discardPrepared(gate: object): void {
    const checkout = this.prepared.get(gate);
    this.prepared.delete(gate);
    if (!checkout) return;
    const state = this.states.get(checkout);
    if (state) state.released = true;
    this.modeOwner.release(checkout);
  }

  completion(checkout: CandidateTrialCheckout): CandidateTrialCompletion | undefined { return this.state(checkout).completion; }

  consumeCompletion(proof: object): CandidateTrialCompleted | null {
    const value = this.completed.get(proof);
    this.completed.delete(proof);
    return value ?? null;
  }

  async release(checkout: CandidateTrialCheckout): Promise<void> {
    const state = this.states.get(checkout);
    if (!state || state.released) return;
    state.released = true;
    const errors: unknown[] = [...state.errors];
    try {
      if (state.reserved) await this.input.source.consumer.release(state.reserved.reservation);
    } catch (error) { errors.push(error); }
    try { if (state.reserved) await this.input.source.callbacks.flush(); } catch (error) { errors.push(error); }
    this.modeOwner.release(checkout);
    if (errors.length) throw new AggregateError(errors, "candidate.trial_cleanup_failed");
  }

  private async finish(state: CandidateTrialAuthorityState): Promise<void> {
    if (!state.reserved || !state.frameCompleted || state.invocations.some(invocation => this.input.source.callbacks.completion(invocation) !== "settled")) return;
    await this.input.source.finish(state.reserved.root, state.origin, state.record.invocationId!);
    const inspection = await this.input.source.consumer.inspect(this.input.source.scope);
    if (inspection.state !== "clear" || !state.trialCompleted) return;
    const retained = this.modeOwner.producedRetained(state.checkout);
    if (retained) this.coveredRetained.add(retained);
    const completion = Object.freeze({}) as CandidateTrialCompletion;
    this.completed.set(completion, retained ? { checkout: state.snapshot, generation: inspection.generation, kind: "read_only", retained } : { checkout: state.snapshot, generation: inspection.generation, kind: "live" });
    state.completion = completion;
  }

  private async diagnostic(state: CandidateTrialAuthorityState): Promise<void> {
    const retained = this.modeOwner.readOnlyTarget(state.checkout);
    if (!retained) return;
    const inspection = await this.input.source.consumer.inspect(this.input.source.scope);
    const completion = Object.freeze({}) as CandidateTrialCompletion;
    this.completed.set(completion, { checkout: state.snapshot, generation: inspection.generation, kind: "read_only", retained });
    state.completion = completion;
  }

  private state(checkout: object): CandidateTrialAuthorityState {
    const state = this.states.get(checkout);
    if (!state || state.released || this.modeOwner.read(checkout) !== state.snapshot) throw new Error("candidate.trial_checkout_lost");
    return state;
  }

}
