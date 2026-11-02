import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRunEnvironment } from "../../../../../runtime/environment/index.ts";
import type { AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialRequest, AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import {
  bindCandidateTrialModeOwner, candidateTrialAuthority, candidateTrialRequestKey,
  bindCandidateTrialInvocation, candidateTrialInvocation, candidateTrialModeOwner
} from "../authority/index.ts";
import type { CandidateTrialCheckout, CandidateTrialCheckoutSnapshot, CandidateTrialModeOwner as ModeOwner, CandidateTrialReadOnlyLease, CandidateTrialReadOnlyCall } from "../contracts/index.ts";
import type { AutomationStudioCandidateTrialStart, AutomationStudioCandidateTrialUnjudged } from "../../service/candidate-trial/index.ts";
import { candidateTrialReadOnlyPorts } from "./read-only-ports.ts";
import { candidateTrialOfflineLease } from "./offline-lease.ts";
import { trialOfflineRunner } from "../observation/index.ts";

type State = {
  readonly checkout: CandidateTrialCheckout;
  readonly key: string;
  snapshot: CandidateTrialCheckoutSnapshot;
  readonly candidate: AutomationStudioFlowCandidate;
  readonly retained: AutomationStudioCandidateTrialUnjudged | undefined;
  prepared: AutomationStudioCandidateTrialStart | undefined;
  ran: boolean;
  released: boolean;
  lease: CandidateTrialReadOnlyLease | undefined;
  produced: AutomationStudioCandidateTrialUnjudged | undefined;
  offline: { original: NonNullable<ReturnType<typeof trialOfflineRunner>>; lease: object } | undefined;
};

export class AutomationStudioCandidateTrialModeOwner implements ModeOwner {
  readonly port: AutomationStudioCandidateTrialPort;
  private readonly states = new WeakMap<object, State>();
  private active: State | undefined;
  private legacyReady: { key: string; start: AutomationStudioCandidateTrialStart } | undefined;
  private readonly environmentKind: NonNullable<AutomationStudioCandidateTrialPort["environmentKind"]>;

  constructor(private readonly input: {
    port: AutomationStudioCandidateTrialPort;
    candidateId: string;
    environment: AutomationStudioRunEnvironment | undefined;
    environmentNow?: (() => AutomationStudioRunEnvironment | undefined) | undefined;
    offlineTarget?: object | undefined;
    unjudged: Map<string, AutomationStudioCandidateTrialUnjudged>;
  }) {
    this.port = input.port;
    this.environmentKind = input.environment?.kind ?? "live";
    bindCandidateTrialModeOwner(input.port, this);
  }

  checkout(gate: object, candidate: AutomationStudioFlowCandidate, value: JsonObject): CandidateTrialCheckout {
    if (this.active && !this.active.released) throw new Error("candidate.trial_in_flight");
    const environment = this.input.environmentNow ? this.input.environmentNow() : this.input.environment;
    if (environment !== this.input.environment || (environment?.kind ?? "live") !== this.environmentKind) throw new Error("candidate.trial_environment_changed");
    const key = `${candidate.revision}:${candidate.digest}`;
    const retained = this.input.unjudged.get(key);
    this.input.unjudged.delete(key);
    const mode = retained ? "cached_rejudge" : this.environmentKind === "live" ? "live" : "offline";
    const checkout = Object.freeze({}) as CandidateTrialCheckout;
    const snapshot: CandidateTrialCheckoutSnapshot = Object.freeze({
      gate, candidateId: this.input.candidateId,
      receipt: Object.freeze({ revision: candidate.revision, digest: candidate.digest, baseDependencyDigest: candidate.baseDependencyDigest }),
      requestKey: candidateTrialRequestKey(this.input.candidateId, candidate, value),
      environment: this.input.environment, environmentKind: this.environmentKind,
      mode, port: this.port, ...(retained ? { retained } : {})
    });
    const state: State = { checkout, key, snapshot, candidate, retained, prepared: undefined, ran: false, released: false, lease: undefined, produced: undefined, offline: retained ? undefined : this.offline(candidate) };
    this.states.set(checkout, state);
    this.active = state;
    return checkout;
  }

  checkoutReadOnly(gate: object, candidate: AutomationStudioFlowCandidate, value: JsonObject, retained: object): CandidateTrialCheckout | undefined {
    if (this.active && !this.active.released) return undefined;
    const cached = this.input.unjudged.get(`${candidate.revision}:${candidate.digest}`) === retained;
    const offline = this.input.offlineTarget ? trialOfflineRunner(this.input.offlineTarget) : undefined;
    if (!cached && (!offline?.contract?.current() || !offline.runner.current(retained, this.input.candidateId, candidate))) return undefined;
    const checkout = this.checkout(gate, candidate, value);
    if (!cached && offline) {
      const state = this.state(checkout);
      state.offline = { original: offline, lease: retained };
      state.snapshot = Object.freeze({ ...state.snapshot, mode: "offline" });
    }
    if (this.readOnlyLease(checkout)) return checkout;
    this.release(checkout);
    return undefined;
  }

  read(checkout: object): CandidateTrialCheckoutSnapshot | null {
    const state = this.states.get(checkout);
    return state && !state.released ? state.snapshot : null;
  }

  attachStart(input: Parameters<NonNullable<AutomationStudioCandidateTrialPort["prepareStart"]>>[0], checkout: CandidateTrialCheckout): void {
    const state = this.state(checkout);
    if (input.revision !== state.snapshot.receipt.revision || input.digest !== state.snapshot.receipt.digest) throw new Error("candidate.trial_checkout_mismatch");
    bindCandidateTrialInvocation(input, this, checkout);
  }

  attachRun(request: AutomationStudioCandidateTrialRequest, checkout: CandidateTrialCheckout): void {
    const state = this.state(checkout);
    if (request.candidateId !== state.snapshot.candidateId || request.revision !== state.snapshot.receipt.revision || request.digest !== state.snapshot.receipt.digest
      || request.candidate.baseDependencyDigest !== state.snapshot.receipt.baseDependencyDigest) throw new Error("candidate.trial_checkout_mismatch");
    bindCandidateTrialInvocation(request, this, checkout);
  }

  readOnlyLease(checkout: CandidateTrialCheckout): CandidateTrialReadOnlyLease | undefined {
    const state = this.state(checkout);
    const supported = candidateTrialReadOnlyPorts.get(this.port);
    if (state.snapshot.mode === "cached_rejudge") {
      if (!state.retained || state.snapshot.retained !== state.retained || !supported?.cached) return undefined;
    } else if (state.snapshot.mode === "offline") {
      if (state.offline?.original.contract?.current() && (state.offline.original.runner.current(state.offline.lease, this.input.candidateId, state.candidate) || state.offline.original.runner.active(state.offline.lease))) return state.lease ??= Object.freeze({}) as CandidateTrialReadOnlyLease;
      if (!supported?.offline || supported.offline.environment !== state.snapshot.environment
        || supported.offline.lease !== candidateTrialOfflineLease(state.snapshot.environment)) return undefined;
    } else return undefined;
    return state.lease ??= Object.freeze({}) as CandidateTrialReadOnlyLease;
  }

  readOnlyCall<TReceiver>(checkout: CandidateTrialCheckout, port: object, receiver: TReceiver, request: AutomationStudioCandidateTrialRequest): CandidateTrialReadOnlyCall<TReceiver> | undefined {
    const state = this.state(checkout);
    const lease = this.readOnlyLease(checkout);
    if (!lease || candidateTrialModeOwner(port) !== this) return undefined;
    if (state.snapshot.mode === "offline" && state.offline?.original.contract) {
      if (state.ran) throw new Error("candidate.trial_checkout_spent");
      this.attachRun(request, checkout);
      state.ran = true;
      const { original, lease: offlineLease } = state.offline;
      const contract = original.contract!;
      return { kind: "owned", callbacks: contract.callbacks, call: { receiver: original.runner, callback: contract.registration.callback, args: [offlineLease, request], ...(contract.registration.binding ? { binding: contract.registration.binding } : {}) } };
    }
    const supported = candidateTrialReadOnlyPorts.get(port);
    const offline = supported?.offline;
    const callback = state.snapshot.mode === "cached_rejudge" ? supported?.cached
      : offline && offline.environment === state.snapshot.environment && offline.lease === candidateTrialOfflineLease(state.snapshot.environment) ? offline.callback : undefined;
    if (!callback) return undefined;
    this.attachRun(request, checkout);
    const args: [AutomationStudioCandidateTrialRequest] = [request];
    return { kind: "port", call: { receiver, callback, args, binding: lease } };
  }

  producedRetained(checkout: CandidateTrialCheckout): object | undefined { return this.state(checkout).produced; }

  readOnlyTarget(checkout: CandidateTrialCheckout): object | undefined {
    const state = this.state(checkout);
    if (state.produced) return state.produced;
    if (!state.offline || !state.offline.original.runner.current(state.offline.lease, this.input.candidateId, state.candidate)) state.offline = this.offline(state.candidate);
    return state.offline?.lease;
  }

  selectReadOnly(checkout: CandidateTrialCheckout): boolean {
    const state = this.state(checkout);
    if (state.ran || state.snapshot.mode !== "live" || !state.offline?.original.contract?.current() || !state.offline.original.runner.current(state.offline.lease, this.input.candidateId, state.candidate)) return false;
    state.snapshot = Object.freeze({ ...state.snapshot, mode: "offline" });
    return true;
  }

  offlineInvocationActive(checkout: CandidateTrialCheckout): boolean {
    const state = this.state(checkout);
    return state.snapshot.mode === "offline" && state.ran && state.offline?.original.contract?.current() === true && state.offline.original.runner.active(state.offline.lease);
  }

  keep(checkout: CandidateTrialCheckout, retained: AutomationStudioCandidateTrialUnjudged): void {
    const state = this.state(checkout);
    state.produced = retained;
    this.input.unjudged.set(state.key, retained);
  }

  start(input: Parameters<NonNullable<AutomationStudioCandidateTrialPort["prepareStart"]>>[0]): State | undefined {
    const bound = candidateTrialInvocation(input);
    if (bound) {
      if (bound.modeOwner !== this) throw new Error("candidate.trial_checkout_foreign");
      return this.state(bound.checkout);
    }
    if (candidateTrialAuthority(this.port)) throw new Error("candidate.trial_checkout_required");
    return undefined;
  }

  run(request: AutomationStudioCandidateTrialRequest): { state: State; automatic: boolean } {
    const bound = candidateTrialInvocation(request);
    if (bound && bound.modeOwner !== this) throw new Error("candidate.trial_checkout_foreign");
    if (!bound && candidateTrialAuthority(this.port)) throw new Error("candidate.trial_checkout_required");
    const checkout = bound?.checkout ?? this.checkout(request, request.candidate, {});
    const state = this.state(checkout);
    if (state.ran) throw new Error("candidate.trial_checkout_spent");
    this.attachRun(request, checkout);
    state.ran = true;
    if (!bound && this.legacyReady?.key === state.key) state.prepared = this.legacyReady.start;
    this.legacyReady = undefined;
    return { state, automatic: !bound };
  }

  setLegacyReady(key: string, start: AutomationStudioCandidateTrialStart): void {
    this.legacyReady = { key, start };
  }

  clearLegacyReady(): void { this.legacyReady = undefined; }

  release(checkout: CandidateTrialCheckout): void {
    const state = this.states.get(checkout);
    if (!state || state.released) return;
    state.released = true;
    if (!state.ran && state.retained && !this.input.unjudged.has(state.key)) this.input.unjudged.set(state.key, state.retained);
    if (this.active === state) this.active = undefined;
  }

  private state(checkout: object): State {
    const state = this.states.get(checkout);
    if (!state || state.released) throw new Error("candidate.trial_checkout_lost");
    const environment = this.input.environmentNow ? this.input.environmentNow() : this.input.environment;
    if (environment !== state.snapshot.environment || (environment?.kind ?? "live") !== state.snapshot.environmentKind) throw new Error("candidate.trial_environment_changed");
    return state;
  }

  private offline(candidate: AutomationStudioFlowCandidate): State["offline"] {
    const original = this.input.offlineTarget ? trialOfflineRunner(this.input.offlineTarget) : undefined;
    if (!original?.contract?.current()) return undefined;
    const lease = original.runner.pin(this.input.candidateId, candidate);
    return lease ? { original, lease } : undefined;
  }
}
