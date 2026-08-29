export type StoreScope = string;
export type StoreListener = () => void;

export type ScopedExternalStore<T> = {
  getState(): T;
  getRevision(scope?: StoreScope): number;
  replace(next: T, scopes?: readonly StoreScope[]): boolean;
  update(updater: (current: T) => T, scopes?: readonly StoreScope[]): boolean;
  subscribe(listener: StoreListener, scope?: StoreScope): () => void;
  transaction<Result>(operation: () => Result): Result;
};

export function createScopedExternalStore<T>(initialState: T): ScopedExternalStore<T> {
  let state = initialState;
  let globalRevision = 0;
  let transactionDepth = 0;
  const scopeRevisions = new Map<StoreScope, number>();
  const globalListeners = new Set<StoreListener>();
  const scopedListeners = new Map<StoreScope, Set<StoreListener>>();
  const pendingScopes = new Set<StoreScope>();
  let pendingPublish = false;

  const flush = () => {
    if (!pendingPublish || transactionDepth > 0) return;
    pendingPublish = false;
    globalRevision += 1;
    const scopes = [...pendingScopes];
    pendingScopes.clear();
    for (const scope of scopes) scopeRevisions.set(scope, (scopeRevisions.get(scope) ?? 0) + 1);
    for (const listener of globalListeners) listener();
    const notified = new Set(globalListeners);
    for (const scope of scopes) {
      for (const listener of scopedListeners.get(scope) ?? []) {
        if (notified.has(listener)) continue;
        notified.add(listener);
        listener();
      }
    }
  };

  const publish = (scopes: readonly StoreScope[]) => {
    pendingPublish = true;
    for (const scope of scopes) pendingScopes.add(scope);
    flush();
  };

  const replace = (next: T, scopes: readonly StoreScope[] = ["*"]) => {
    if (Object.is(next, state)) return false;
    state = next;
    publish(scopes.length ? scopes : ["*"]);
    return true;
  };

  return {
    getState: () => state,
    getRevision: (scope) => scope ? scopeRevisions.get(scope) ?? 0 : globalRevision,
    replace,
    update(updater, scopes) {
      return replace(updater(state), scopes);
    },
    subscribe(listener, scope) {
      if (!scope) {
        globalListeners.add(listener);
        return () => globalListeners.delete(listener);
      }
      const listeners = scopedListeners.get(scope) ?? new Set<StoreListener>();
      listeners.add(listener);
      scopedListeners.set(scope, listeners);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) scopedListeners.delete(scope);
      };
    },
    transaction(operation) {
      transactionDepth += 1;
      try {
        return operation();
      } finally {
        transactionDepth -= 1;
        flush();
      }
    }
  };
}