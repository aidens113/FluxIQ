import type { JsonObject } from "../../../core/index.ts";
import type { StateDelta, StatePathSchema, StateSnapshot, StateValue } from "./state.ts";
import { applyStateDeltas, diffStateSnapshots } from "./state-diff.ts";

export type StateChangeEvent = {
  snapshot: StateSnapshot;
  deltas: StateDelta[];
  source?: string;
  metadata?: JsonObject;
};

export type StateUnsubscribe = () => void;

export type AutomationStateStore = {
  read(namespace: string, path: string): StateValue | undefined;
  write(namespace: string, path: string, value: StateValue, options?: { source?: string; metadata?: JsonObject }): StateChangeEvent;
  update(namespace: string, path: string, updater: (value: StateValue | undefined) => StateValue | undefined, options?: { source?: string; metadata?: JsonObject }): StateChangeEvent;
  snapshot(): StateSnapshot;
  restore(snapshot: StateSnapshot, options?: { source?: string; metadata?: JsonObject }): StateChangeEvent;
  diff(snapshot: StateSnapshot): StateDelta[];
  subscribe(listener: (event: StateChangeEvent) => void): StateUnsubscribe;
  registerSchema(schema: StatePathSchema): void;
  schemas(): StatePathSchema[];
};

export class AutomationInMemoryStateStore implements AutomationStateStore {
  private current: StateSnapshot;
  private readonly listeners = new Set<(event: StateChangeEvent) => void>();
  private readonly schemaByPath = new Map<string, StatePathSchema>();

  constructor(snapshot: StateSnapshot = emptyStateSnapshot()) {
    this.current = structuredClone(snapshot);
  }

  read(namespace: string, path: string): StateValue | undefined {
    const value = this.current.namespaces[namespace]?.values[path];
    return value ? structuredClone(value) : undefined;
  }

  write(namespace: string, path: string, value: StateValue, options: { source?: string; metadata?: JsonObject } = {}): StateChangeEvent {
    return this.update(namespace, path, () => value, options);
  }

  update(namespace: string, path: string, updater: (value: StateValue | undefined) => StateValue | undefined, options: { source?: string; metadata?: JsonObject } = {}): StateChangeEvent {
    const previous = this.snapshot();
    const next = this.snapshot();
    const ns = next.namespaces[namespace] ?? { schemaId: namespace, schemaVersion: "0.1", values: {} };
    next.namespaces[namespace] = ns;
    const value = updater(ns.values[path] ? structuredClone(ns.values[path]) : undefined);
    if (value === undefined) delete ns.values[path];
    else ns.values[path] = structuredClone(value);
    next.timestamp = value?.observedAt ?? Date.now();
    return this.commit(previous, next, options);
  }

  snapshot(): StateSnapshot {
    return structuredClone(this.current);
  }

  restore(snapshot: StateSnapshot, options: { source?: string; metadata?: JsonObject } = {}): StateChangeEvent {
    return this.commit(this.snapshot(), structuredClone(snapshot), options);
  }

  diff(snapshot: StateSnapshot): StateDelta[] {
    return diffStateSnapshots(this.current, snapshot);
  }

  subscribe(listener: (event: StateChangeEvent) => void): StateUnsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  registerSchema(schema: StatePathSchema): void {
    this.schemaByPath.set(`${schema.namespace}:${schema.path}`, structuredClone(schema));
  }

  schemas(): StatePathSchema[] {
    return [...this.schemaByPath.values()].map((schema) => structuredClone(schema));
  }

  private commit(previous: StateSnapshot, next: StateSnapshot, options: { source?: string; metadata?: JsonObject }): StateChangeEvent {
    const deltas = diffStateSnapshots(previous, next);
    this.current = structuredClone(next);
    const event: StateChangeEvent = {
      snapshot: this.snapshot(),
      deltas,
      ...(options.source !== undefined ? { source: options.source } : {}),
      ...(options.metadata !== undefined ? { metadata: options.metadata } : {})
    };
    for (const listener of this.listeners) listener(event);
    return event;
  }
}

export function emptyStateSnapshot(timestamp = Date.now()): StateSnapshot {
  return { timestamp, namespaces: {} };
}

export function stateValue(type: StateValue["type"], value: unknown, observedAt = Date.now(), options: Omit<StateValue, "type" | "value" | "observedAt"> = {}): StateValue {
  return { type, value, observedAt, ...options };
}

export { applyStateDeltas };
