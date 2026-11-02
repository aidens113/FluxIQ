import type { ExecutionAdmissionPersistence, ExecutionEntryRow, ExecutionInspection, ExecutionScopeBinding, StoredExecutionScope, VerifiedExecutionEvidence } from "../index.ts";

type Operation = keyof ExecutionAdmissionPersistence;
type StoredEntry = { row: ExecutionEntryRow; facts: VerifiedExecutionEvidence[]; closed: boolean; entered: boolean; frontier: readonly string[] };
type Pause = { readonly entered: Promise<void>; readonly release: () => void; readonly reached: () => void; readonly wait: Promise<void> };

/** Transactional fake with durable state independent of any authority incarnation. */
export class AdmissionTestPersistence implements ExecutionAdmissionPersistence {
  readonly events: string[] = [];
  readonly rows = new Map<string, StoredEntry>();
  readonly scopes = new Map<string, { stored: StoredExecutionScope; baseline: "complete" | "unverified" }>();
  readonly required = new Set<string>();
  readonly requests: { operation: Operation; value: unknown }[] = [];
  readonly #active = new Map<string, { rootId: string; generation: string }>();
  readonly #calls = new Set<string>();
  readonly #failures = new Map<Operation, Error>();
  readonly #pauses = new Map<Operation, Pause>();
  #tail: Promise<void> = Promise.resolve();
  #generation = 0;

  failNext(operation: Operation): Error {
    const failure = new Error(`store.${operation}_failed`);
    this.#failures.set(operation, failure);
    return failure;
  }

  pauseNext(operation: Operation): Pick<Pause, "entered" | "release"> {
    let reached!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    this.#pauses.set(operation, { entered, release, reached, wait });
    return { entered, release };
  }

  async open(input: Parameters<ExecutionAdmissionPersistence["open"]>[0]): Promise<StoredExecutionScope> {
    return this.#transaction("open", input, () => {
      const found = [...this.scopes.values()].find(value => value.stored.binding.projectId === input.binding.projectId && value.stored.binding.ownerKey === input.binding.ownerKey && value.stored.binding.continuationKey === input.binding.continuationKey);
      if (found) {
        if (JSON.stringify(found.stored.binding) !== JSON.stringify(input.binding)) throw new Error("store.binding_changed");
        return found.stored;
      }
      const stored = { scopeId: `scope.${this.scopes.size + 1}`, binding: structuredClone(input.binding) };
      this.scopes.set(stored.scopeId, { stored, baseline: input.baseline });
      return stored;
    });
  }

  async inspect(scopeId: string): Promise<ExecutionInspection> {
    return this.#transaction("inspect", scopeId, () => this.#inspection(scopeId));
  }

  async reserve(input: Parameters<ExecutionAdmissionPersistence["reserve"]>[0]): Promise<{ readonly fenceGeneration: string }> {
    return this.#transaction("reserve", input, () => {
      const scope = this.#scope(input.root.scopeId);
      const inspection = this.#inspection(input.root.scopeId);
      if (inspection.state === "pending" || inspection.state === "required_latched") throw new Error("store.blocked");
      const earlier = [...this.rows.values()].some(row => row.row.scopeId === input.root.scopeId && row.row.sourceKey === input.root.sourceKey && row.row.seriesKey === input.root.seriesKey && row.entered);
      if (input.policy.kind === "trial_series" && earlier && inspection.state !== "clear") throw new Error("store.unverified_reentry");
      const callKey = `${input.root.scopeId}:${input.root.sourceKey}:${input.ordinaryCallKey}`;
      if (this.#calls.has(callKey)) throw new Error("store.duplicate_call");
      if (scope.stored.binding.resourceKeys.some(resource => this.#active.has(resource))) throw new Error("store.busy");
      const generation = `fence.${++this.#generation}`;
      this.rows.set(input.root.entryId, { row: structuredClone(input.root), facts: [], closed: false, entered: false, frontier: [] });
      this.#calls.add(callKey);
      for (const resource of input.root.resourceKeys) this.#active.set(resource, { rootId: input.root.rootId, generation });
      return { fenceGeneration: generation };
    });
  }

  async enter(input: Parameters<ExecutionAdmissionPersistence["enter"]>[0]): Promise<void> {
    return this.#transaction("enter", input, () => {
      const root = this.#entry(input.entry.rootId);
      const parent = input.entry.parentId && this.#entry(input.entry.parentId);
      if (!parent || parent.closed || root.closed || parent.row.scopeId !== input.entry.scopeId) throw new Error("store.parent_closed");
      this.#fence(root.row, input.fenceGeneration);
      if ([...this.rows.values()].some(row => row.row.rootId === root.row.entryId && !row.closed && row.facts.some(fact => fact.kind === "interrupted" || fact.kind === "terminal_unknown" || fact.kind === "required_latched"))) throw new Error("store.blocked");
      this.rows.set(input.entry.entryId, { row: structuredClone(input.entry), facts: [], closed: false, entered: true, frontier: [] });
      let ancestor: StoredEntry | undefined = parent;
      while (ancestor) {
        ancestor.entered = true;
        ancestor = ancestor.row.parentId ? this.#entry(ancestor.row.parentId) : undefined;
      }
      this.#generation++;
    });
  }

  async append(input: Parameters<ExecutionAdmissionPersistence["append"]>[0]): Promise<void> {
    return this.#transaction("append", input, () => {
      const entry = this.#entry(input.entryId);
      if (entry.closed) throw new Error("store.entry_closed");
      entry.facts.push(structuredClone(input.evidence));
      this.#generation++;
    });
  }

  async finish(input: Parameters<ExecutionAdmissionPersistence["finish"]>[0]): Promise<void> {
    return this.#transaction("finish", input, () => {
      const entry = this.#entry(input.entryId);
      if (entry.closed || entry.facts.some(fact => fact.kind === "terminal_unknown" || fact.kind === "required_latched")) throw new Error("store.terminal");
      this.#fence(entry.row);
      const children = [...this.rows.values()].filter(row => row.row.parentId === input.entryId);
      if (children.some(child => !child.closed)) throw new Error("store.children_open");
      if (this.required.has(input.entryId) && !entry.facts.some(fact => fact.kind === "required_consumed")) throw new Error("store.handling_missing");
      entry.frontier = children.map(child => child.row.entryId).sort();
      entry.facts.push(structuredClone(input.evidence));
      entry.closed = true;
      this.#generation++;
    });
  }

  async release(input: Parameters<ExecutionAdmissionPersistence["release"]>[0]): Promise<void> {
    return this.#transaction("release", input, () => {
      const root = this.#entry(input.rootId);
      if (root.row.ownerIncarnation !== input.ownerIncarnation) throw new Error("store.foreign_incarnation");
      for (const resource of root.row.resourceKeys) {
        const active = this.#active.get(resource);
        if (active?.rootId === root.row.entryId) this.#active.delete(resource);
      }
      this.#generation++;
    });
  }

  #scope(id: string) {
    const scope = this.scopes.get(id);
    if (!scope) throw new Error("store.scope_missing");
    return scope;
  }

  #entry(id: string): StoredEntry {
    const entry = this.rows.get(id);
    if (!entry) throw new Error("store.entry_missing");
    return entry;
  }

  #fence(row: ExecutionEntryRow, generation?: string): void {
    for (const resource of row.resourceKeys) {
      const fence = this.#active.get(resource);
      if (!fence || fence.rootId !== row.rootId || generation !== undefined && fence.generation !== generation) throw new Error("store.fence_changed");
    }
  }

  #inspection(scopeId: string): ExecutionInspection {
    const scope = this.#scope(scopeId);
    const relevant = [...this.rows.values()].filter(row => row.row.scopeId === scopeId || row.row.resourceKeys.some(resource => scope.stored.binding.resourceKeys.includes(resource)));
    const open = relevant.filter(row => !row.closed);
    const required = open.filter(row => row.facts.some(fact => fact.kind === "required_latched"));
    const pending = open.filter(row => !row.facts.some(fact => fact.kind === "returned_unverified") || row.facts.some(fact => fact.kind === "interrupted" || fact.kind === "terminal_unknown"));
    const state = required.length ? "required_latched" : pending.length ? "pending" : open.length || scope.baseline === "unverified" ? "unverified" : "clear";
    return { state, generation: `generation.${this.#generation}`, blockers: open.map(row => ({ entryId: row.row.entryId, code: "store.coverage_open" })) };
  }

  async #transaction<T>(operation: Operation, value: unknown, body: () => T): Promise<T> {
    this.requests.push({ operation, value });
    let unlock!: () => void;
    const prior = this.#tail;
    this.#tail = new Promise<void>(resolve => { unlock = resolve; });
    await prior;
    try {
      this.events.push(operation);
      const pause = this.#pauses.get(operation);
      this.#pauses.delete(operation);
      if (pause) {
        pause.reached();
        await pause.wait;
      }
      const failure = this.#failures.get(operation);
      this.#failures.delete(operation);
      if (failure) throw failure;
      return body();
    } finally {
      unlock();
    }
  }
}
