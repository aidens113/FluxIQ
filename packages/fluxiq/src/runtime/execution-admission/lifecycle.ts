import type {
  ExecutionAdmissionAssembly, ExecutionAdmissionFactoryInput, ExecutionAdmissionPersistence,
  ExecutionEntry, ExecutionEntryGrant, ExecutionEntryRow, ExecutionEntrySnapshot,
  ExecutionObservationContext, ExecutionOriginRecord, ExecutionReservation,
  ExecutionScope, ExecutionScopeBinding, ExecutionSourcePorts, ExecutionSourceRegistration,
  ReservedExecution, StoredExecutionScope, VerifiedExecutionEvidence
} from "./contracts/index.ts";
import { executionBinding, executionEvidence, executionInspection, executionOrigin, executionRecord, executionText, isExecutionCapability } from "./validation/index.ts";
import { releaseExecutionReservation } from "./release.ts";

type Source = {
  owner: object;
  scope: Scope;
  key: string;
  delegates: ReadonlySet<object>;
  policy: ExecutionSourceRegistration["rootPolicy"];
  origin(value: object): ExecutionOriginRecord | null;
  admission(value: object): { readonly origin: object; readonly callKey: string } | null;
  evidence(origin: object, proof: object): VerifiedExecutionEvidence | null;
};
type Scope = { handle: ExecutionScope; stored: StoredExecutionScope };
type Grant = { source: Source; origin: object; record: ExecutionOriginRecord; callKey: string; spent: boolean };
type Reservation = {
  handle: ExecutionReservation;
  scope: Scope;
  root: Entry | null;
  generation: string | undefined;
  phase: "reserving" | "active" | "releasing" | "released" | "failed";
  aborted: boolean;
  signal: AbortSignal | undefined;
  entries: Set<Entry>;
  operations: Set<Promise<unknown>>;
  cleanupErrors: unknown[];
  release: Promise<void> | undefined;
};
type Entry = {
  handle: ExecutionEntry;
  source: Source;
  origin: object;
  row: ExecutionEntryRow;
  reservation: Reservation;
  parent: Entry | null;
  children: Set<Entry>;
  phase: "entering" | "open" | "finishing" | "closed" | "blocked";
  persisted: boolean;
  interrupted: boolean;
  terminal: boolean;
  pending: number;
  detach: () => void;
};
/** Private capability lifecycle only. Durable safety decisions belong to the configured port. */
export class ExecutionAdmissionLifecycle {
  readonly assembly: ExecutionAdmissionAssembly;
  private readonly persistence: ExecutionAdmissionPersistence;
  private readonly readBinding: ExecutionAdmissionFactoryInput["scopes"]["readBinding"];
  private readonly scopes = new WeakMap<object, Scope>();
  private readonly grants = new WeakMap<object, Grant>();
  private readonly reservations = new WeakMap<object, Reservation>();
  private readonly entries = new WeakMap<object, Entry>();
  private readonly proofs = new WeakSet<object>();
  private readonly origins = new WeakSet<object>();
  private readonly evidence = new WeakSet<object>();
  private readonly sources: Source[] = [];
  private readonly incarnation = globalThis.crypto.randomUUID();
  private bound: ExecutionScopeBinding | undefined;
  private opening: Promise<ExecutionScope> | undefined;
  private registrationClosed = false;

  constructor(input: ExecutionAdmissionFactoryInput) {
    this.readBinding = input.scopes.readBinding.bind(input.scopes);
    const port = input.persistence;
    this.persistence = Object.freeze({
      open: port.open.bind(port), inspect: port.inspect.bind(port), reserve: port.reserve.bind(port),
      enter: port.enter.bind(port), append: port.append.bind(port), finish: port.finish.bind(port), release: port.release.bind(port)
    });
    this.assembly = Object.freeze({
      consumer: Object.freeze({
        inspect: (scope: ExecutionScope) => this.inspect(scope),
        reserve: (scope: ExecutionScope, grant: ExecutionEntryGrant, signal?: AbortSignal) => this.reserve(scope, grant, signal),
        release: (reservation: ExecutionReservation) => this.release(reservation)
      }),
      entryBridge: Object.freeze({
        read: (entry: ExecutionEntry) => this.readEntry(entry),
        matchesReservation: (entry: ExecutionEntry, reservation: ExecutionReservation) =>
          this.entries.has(entry) && this.reservations.has(reservation) && this.entries.get(entry)!.reservation === this.reservations.get(reservation)
      }),
      openScope: (proof: object) => this.openScope(proof),
      registerSource: (source: ExecutionSourceRegistration) => this.registerSource(source)
    });
  }

  private openScope(proof: object): Promise<ExecutionScope> {
    if (!isExecutionCapability(proof)) return Promise.reject(new Error("execution_admission.invalid_scope_proof"));
    try {
      const verified = executionRecord(this.readBinding(proof), ["binding", "baseline", "baselineProofDigest"], ["binding", "baseline", "baselineProofDigest"], "scope_proof");
      const binding = executionBinding(verified.binding);
      if (verified.baseline !== "complete" && verified.baseline !== "unverified") throw new Error("execution_admission.invalid_baseline");
      const baseline = verified.baseline;
      const baselineProofDigest = executionText(verified.baselineProofDigest, "baseline_proof");
      if (this.bound && JSON.stringify(this.bound) !== JSON.stringify(binding)) throw new Error("execution_admission.configured_scope_changed");
      if (this.opening) return this.opening;
      this.bound = binding;
      const request = Object.freeze({ binding, baseline, baselineProofDigest });
      this.opening = (async () => {
        const returned = executionRecord(await this.persistence.open(request), ["scopeId", "binding"], ["scopeId", "binding"], "stored_scope");
        const storedBinding = executionBinding(returned.binding);
        if (JSON.stringify(storedBinding) !== JSON.stringify(binding)) throw new Error("execution_admission.stored_scope_changed");
        const stored = Object.freeze({ scopeId: executionText(returned.scopeId, "scope"), binding: storedBinding });
        const handle = Object.freeze({}) as ExecutionScope;
        this.scopes.set(handle, { handle, stored });
        return handle;
      })();
      return this.opening;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private registerSource(registration: ExecutionSourceRegistration): ExecutionSourcePorts {
    if (this.registrationClosed) throw new Error("execution_admission.registration_closed");
    const scope = this.scope(registration.scope);
    if (!isExecutionCapability(registration.owner)) throw new Error("execution_admission.invalid_source_owner");
    const key = executionText(registration.sourceKey, "source");
    if (this.sources.some(source => source.key === key)) throw new Error("execution_admission.duplicate_source");
    if (!Array.isArray(registration.delegatesTo) || registration.delegatesTo.length > 64 || registration.delegatesTo.some(value => !isExecutionCapability(value))) throw new Error("execution_admission.invalid_delegation");
    const policy = executionRecord(registration.rootPolicy, ["kind", "seriesKey"], ["kind"], "policy");
    if (policy.kind !== "ordinary" && policy.kind !== "trial_series") throw new Error("execution_admission.invalid_policy");
    if (policy.kind === "ordinary" && Object.hasOwn(policy, "seriesKey")) throw new Error("execution_admission.invalid_policy");
    const rootPolicy = policy.kind === "ordinary"
      ? Object.freeze({ kind: "ordinary" as const })
      : Object.freeze({ kind: "trial_series" as const, seriesKey: executionText(policy.seriesKey, "series") });
    const source: Source = {
      owner: registration.owner, scope, key, policy: rootPolicy, delegates: new Set(registration.delegatesTo),
      origin: registration.readOrigin.bind(registration),
      admission: registration.readOrdinaryAdmission.bind(registration),
      evidence: registration.consumeEvidence.bind(registration)
    };
    this.sources.push(source);
    return Object.freeze({
      issuer: Object.freeze({ fromOrdinaryAdmission: (proof: object) => this.issue(source, proof) }),
      producer: Object.freeze({
        enter: (context: ExecutionObservationContext, origin: object, signal?: AbortSignal) => this.enter(source, context, origin, signal),
        observe: (entry: ExecutionEntry, evidence: object) => this.observe(source, entry, evidence),
        finish: (entry: ExecutionEntry, evidence: object) => this.finish(source, entry, evidence),
        interrupted: (entry: ExecutionEntry, reason: "aborted" | "timed_out" | "callback_threw" | "observer_failed") => this.interrupted(source, entry, reason)
      })
    });
  }

  private issue(source: Source, proof: object): ExecutionEntryGrant {
    if (!isExecutionCapability(proof) || this.proofs.has(proof)) throw new Error("execution_admission.admission_proof_spent");
    this.proofs.add(proof);
    const admitted = executionRecord(source.admission(proof), ["origin", "callKey"], ["origin", "callKey"], "ordinary_admission");
    if (!isExecutionCapability(admitted.origin) || this.origins.has(admitted.origin)) throw new Error("execution_admission.origin_spent");
    this.origins.add(admitted.origin);
    const record = executionOrigin(source.origin(admitted.origin), source.key);
    const handle = Object.freeze({}) as ExecutionEntryGrant;
    this.grants.set(handle, { source, origin: admitted.origin, record, callKey: executionText(admitted.callKey, "ordinary_call"), spent: false });
    return handle;
  }

  private async inspect(handle: ExecutionScope) {
    const scope = this.scope(handle);
    return executionInspection(await this.persistence.inspect(scope.stored.scopeId));
  }

  private async reserve(scopeHandle: ExecutionScope, grantHandle: ExecutionEntryGrant, signal?: AbortSignal): Promise<ReservedExecution> {
    const scope = this.scope(scopeHandle);
    const grant = isExecutionCapability(grantHandle) ? this.grants.get(grantHandle) : undefined;
    if (!grant || grant.spent) throw new Error("execution_admission.grant_spent_or_foreign");
    grant.spent = true;
    this.registrationClosed = true;
    if (grant.source.scope !== scope) throw new Error("execution_admission.grant_scope_mismatch");
    if (this.sources.some(source => [...source.delegates].some(owner => !this.sources.some(target => target.owner === owner)))) throw new Error("execution_admission.unregistered_delegate");
    if (signal?.aborted) throw new Error("execution_admission.aborted");
    const handle = Object.freeze({}) as ExecutionReservation;
    const state: Reservation = { handle, scope, root: null, generation: undefined, phase: "reserving", aborted: false, signal, entries: new Set(), operations: new Set(), cleanupErrors: [], release: undefined };
    const root = this.makeEntry(state, grant.source, grant.origin, grant.record, null);
    state.root = root;
    this.reservations.set(handle, state);
    this.bindAbort(root, signal);
    try {
      const request = Object.freeze({ root: root.row, ordinaryCallKey: grant.callKey, policy: grant.source.policy });
      const returned = executionRecord(await this.persistence.reserve(request), ["fenceGeneration"], ["fenceGeneration"], "reservation");
      state.generation = executionText(returned.fenceGeneration, "fence");
      root.persisted = true;
      root.phase = "open";
      if (state.aborted || signal?.aborted) {
        await this.interruption(root, "aborted");
        await this.release(handle);
        throw new Error("execution_admission.aborted");
      }
      state.phase = "active";
      return Object.freeze({ reservation: handle, root: root.handle });
    } catch (error) {
      this.poison(root);
      root.detach();
      throw error;
    }
  }

  private async enter(source: Source, context: ExecutionObservationContext, origin: object, signal?: AbortSignal): Promise<ExecutionEntry> {
    const reservation = this.reservation(context.reservation);
    this.active(reservation);
    const parent = this.entry(context.parent);
    if (parent.reservation !== reservation || parent.source.scope !== source.scope || source.scope !== reservation.scope) throw new Error("execution_admission.parent_scope_mismatch");
    if (parent.phase !== "open" || !parent.persisted) throw new Error("execution_admission.parent_not_open");
    if (!parent.source.delegates.has(source.owner)) throw new Error("execution_admission.delegation_refused");
    if (signal?.aborted) throw new Error("execution_admission.aborted");
    if (!isExecutionCapability(origin) || this.origins.has(origin)) throw new Error("execution_admission.origin_spent");
    this.origins.add(origin);
    const record = executionOrigin(source.origin(origin), source.key);
    const state = this.makeEntry(reservation, source, origin, record, parent);
    this.bindAbort(state, signal);
    try {
      const request = Object.freeze({ entry: state.row, fenceGeneration: reservation.generation! });
      await this.track(reservation, this.persistence.enter(request));
      state.persisted = true;
      state.phase = "open";
      if (signal?.aborted || reservation.aborted || reservation.phase !== "active" || reservation.signal?.aborted) {
        await this.interruption(state, "aborted");
        throw new Error("execution_admission.aborted");
      }
      return state.handle;
    } catch (error) {
      this.poison(state);
      state.detach();
      throw error;
    }
  }

  private async observe(source: Source, handle: ExecutionEntry, proof: object): Promise<void> {
    const state = this.ownedEntry(source, handle);
    const verified = this.consume(state, proof);
    if (verified.kind === "coverage_complete") throw new Error("execution_admission.finish_required");
    if (verified.kind === "terminal_unknown" || verified.kind === "required_latched") {
      state.terminal = true;
      this.poison(state);
    }
    if (verified.kind === "interrupted") state.interrupted = true;
    state.pending++;
    try {
      await this.track(state.reservation, this.persistence.append(Object.freeze({ entryId: state.row.entryId, evidence: verified })));
    } catch (error) {
      this.poison(state);
      throw error;
    } finally {
      state.pending--;
    }
  }

  private async finish(source: Source, handle: ExecutionEntry, proof: object): Promise<void> {
    const state = this.ownedEntry(source, handle);
    const verified = this.consume(state, proof);
    if (verified.kind !== "coverage_complete") throw new Error("execution_admission.completion_required");
    const reservation = state.reservation;
    if (reservation.phase !== "active" || reservation.aborted || reservation.signal?.aborted || state.phase !== "open" || state.terminal || state.pending) throw new Error("execution_admission.entry_not_finishable");
    if ([...state.children].some(child => child.phase !== "closed")) throw new Error("execution_admission.children_unfinished");
    state.phase = "finishing";
    try {
      await this.track(reservation, this.persistence.finish(Object.freeze({ entryId: state.row.entryId, evidence: verified })));
      if (reservation.phase !== "active" || reservation.aborted || reservation.signal?.aborted) throw new Error("execution_admission.finish_interrupted");
      state.phase = "closed";
      state.interrupted = false;
      state.detach();
    } catch (error) {
      this.poison(state);
      throw error;
    }
  }

  private async interrupted(source: Source, handle: ExecutionEntry, reason: "aborted" | "timed_out" | "callback_threw" | "observer_failed"): Promise<void> {
    const state = this.ownedEntry(source, handle);
    const verified = executionEvidence({ kind: "interrupted", reason });
    if (verified.kind !== "interrupted") throw new Error("execution_admission.invalid_interruption");
    await this.interruption(state, verified.reason);
  }

  private release(handle: ExecutionReservation): Promise<void> {
    const state = this.reservation(handle);
    if (state.release) return state.release;
    state.phase = "releasing";
    for (const entry of state.entries) entry.detach();
    state.release = releaseExecutionReservation(state, () => this.persistence.release(Object.freeze({ rootId: state.root!.row.entryId, ownerIncarnation: this.incarnation })));
    return state.release;
  }

  private readEntry(handle: ExecutionEntry): ExecutionEntrySnapshot {
    const state = this.entry(handle);
    const reservation = state.reservation;
    if (!state.persisted || !reservation.generation) throw new Error("execution_admission.entry_not_persisted");
    const active = reservation.phase === "active" && !reservation.aborted && !reservation.signal?.aborted;
    const lifecycle = state.phase === "closed" ? "closed" : state.phase === "finishing" && active ? "finishing" : state.phase === "open" && !state.interrupted && active ? "open" : "blocked";
    return Object.freeze({ row: state.row, fenceGeneration: reservation.generation, sourceOwner: state.source.owner, origin: state.origin, lifecycle, reservationActive: active });
  }

  private makeEntry(reservation: Reservation, source: Source, origin: object, record: ExecutionOriginRecord, parent: Entry | null): Entry {
    const id = globalThis.crypto.randomUUID();
    const row: ExecutionEntryRow = Object.freeze({
      entryId: id, scopeId: reservation.scope.stored.scopeId, rootId: parent?.row.rootId ?? id,
      ...(parent ? { parentId: parent.row.entryId } : {}), resourceKeys: reservation.scope.stored.binding.resourceKeys,
      sourceKey: source.key, ...(!parent && source.policy.kind === "trial_series" ? { seriesKey: source.policy.seriesKey } : {}),
      origin: record, ownerIncarnation: this.incarnation
    });
    const handle = Object.freeze({}) as ExecutionEntry;
    const state: Entry = { handle, source, origin, row, reservation, parent, children: new Set(), phase: "entering", persisted: false, interrupted: false, terminal: false, pending: 0, detach: () => undefined };
    this.entries.set(handle, state);
    reservation.entries.add(state);
    parent?.children.add(state);
    return state;
  }

  private consume(state: Entry, proof: object): VerifiedExecutionEvidence {
    if (state.phase === "closed" || state.phase === "finishing" || !state.persisted) throw new Error("execution_admission.entry_not_open");
    if (!isExecutionCapability(proof) || this.evidence.has(proof)) throw new Error("execution_admission.evidence_spent");
    this.evidence.add(proof);
    return executionEvidence(state.source.evidence(state.origin, proof));
  }

  private active(state: Reservation): void {
    if (state.phase !== "active" || state.aborted || state.signal?.aborted) throw new Error("execution_admission.reservation_not_active");
    if ([...state.entries].some(entry => entry.phase !== "closed" && entry.interrupted)) throw new Error("execution_admission.pending_interruption");
  }

  private bindAbort(entry: Entry, signal: AbortSignal | undefined): void {
    if (!signal) return;
    const onAbort = () => {
      entry.reservation.aborted = true;
      entry.interrupted = true;
      if (entry.persisted && entry.phase !== "closed") {
        const cleanup = this.interruption(entry, "aborted").then(() => undefined, error => {
          this.poison(entry);
          entry.reservation.cleanupErrors.push(error);
        });
        this.track(entry.reservation, cleanup);
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    entry.detach = () => signal.removeEventListener("abort", onAbort);
    if (signal.aborted) onAbort();
  }

  private async interruption(state: Entry, reason: "aborted" | "timed_out" | "callback_threw" | "observer_failed"): Promise<void> {
    if (!state.persisted || state.phase === "closed" || state.phase === "finishing") throw new Error("execution_admission.entry_not_open");
    state.interrupted = true;
    state.pending++;
    try {
      const evidence = Object.freeze({ kind: "interrupted" as const, reason });
      await this.track(state.reservation, this.persistence.append(Object.freeze({ entryId: state.row.entryId, evidence })));
    } catch (error) {
      this.poison(state);
      throw error;
    } finally {
      state.pending--;
    }
  }

  private poison(state: Entry): void {
    state.phase = "blocked";
    state.reservation.phase = "failed";
  }

  private track<T>(state: Reservation, promise: Promise<T>): Promise<T> {
    state.operations.add(promise);
    void promise.then(
      () => state.operations.delete(promise),
      /* best-effort: Only retire tracking; the unchanged promise reports rejection to its caller. */
      () => state.operations.delete(promise)
    );
    return promise;
  }

  private scope(handle: ExecutionScope): Scope {
    const state = isExecutionCapability(handle) ? this.scopes.get(handle) : undefined;
    if (!state) throw new Error("execution_admission.foreign_scope");
    return state;
  }

  private reservation(handle: ExecutionReservation): Reservation {
    const state = isExecutionCapability(handle) ? this.reservations.get(handle) : undefined;
    if (!state) throw new Error("execution_admission.foreign_reservation");
    return state;
  }

  private entry(handle: ExecutionEntry): Entry {
    const state = isExecutionCapability(handle) ? this.entries.get(handle) : undefined;
    if (!state) throw new Error("execution_admission.foreign_entry");
    return state;
  }

  private ownedEntry(source: Source, handle: ExecutionEntry): Entry {
    const state = this.entry(handle);
    if (state.source !== source) throw new Error("execution_admission.entry_source_mismatch");
    return state;
  }
}
