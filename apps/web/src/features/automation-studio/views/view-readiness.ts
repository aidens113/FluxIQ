import { useCallback, useSyncExternalStore } from "react";

export type AutomationViewRequestToken = Readonly<{
  projectGeneration: number;
  requestToken: number;
}>;

export type AutomationViewReadiness<Model> =
  | { status: "ready"; data: Model; token: AutomationViewRequestToken }
  | { status: "empty"; token: AutomationViewRequestToken; message?: string }
  | { status: "error"; token: AutomationViewRequestToken; error: Error }
  | { status: "loading"; token: AutomationViewRequestToken }
  | { status: "stale-ready"; data: Model; token: AutomationViewRequestToken; error?: Error };

export type AutomationViewLoadResult<Model> =
  | { status: "ready"; data: Model }
  | { status: "empty"; message?: string };

export type AutomationViewReadinessOwner<Model> = {
  getSnapshot(): AutomationViewReadiness<Model>;
  subscribe(listener: () => void): () => void;
  begin(projectGeneration: number): AutomationViewRequestToken;
  complete(token: AutomationViewRequestToken, result: AutomationViewLoadResult<Model>): boolean;
  fail(token: AutomationViewRequestToken, error: unknown): boolean;
};

const INITIAL_TOKEN: AutomationViewRequestToken = Object.freeze({ projectGeneration: -1, requestToken: 0 });

export function readyAutomationView<Model>(data: Model): AutomationViewReadiness<Model> {
  return { status: "ready", data, token: INITIAL_TOKEN };
}

export function createAutomationViewReadinessOwner<Model>(
  initial?: AutomationViewReadiness<Model>
): AutomationViewReadinessOwner<Model> {
  let nextRequestToken = 0;
  let snapshot: AutomationViewReadiness<Model> = initial ?? { status: "loading", token: INITIAL_TOKEN };
  const listeners = new Set<() => void>();

  const publish = (next: AutomationViewReadiness<Model>) => {
    if (Object.is(snapshot, next)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const isCurrent = (token: AutomationViewRequestToken) => (
    snapshot.token.projectGeneration === token.projectGeneration
    && snapshot.token.requestToken === token.requestToken
  );

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    begin(projectGeneration) {
      const token = Object.freeze({ projectGeneration, requestToken: ++nextRequestToken });
      if (snapshot.status === "ready" || snapshot.status === "stale-ready") {
        publish({ status: "stale-ready", data: snapshot.data, token });
      } else {
        publish({ status: "loading", token });
      }
      return token;
    },
    complete(token, result) {
      if (!isCurrent(token)) return false;
      publish(result.status === "ready"
        ? { status: "ready", data: result.data, token }
        : { status: "empty", token, ...(result.message === undefined ? {} : { message: result.message }) });
      return true;
    },
    fail(token, error) {
      if (!isCurrent(token)) return false;
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (snapshot.status === "stale-ready") {
        publish({ status: "stale-ready", data: snapshot.data, token, error: normalized });
      } else {
        publish({ status: "error", token, error: normalized });
      }
      return true;
    }
  };
}

export function useAutomationViewReadiness<Model>(owner: AutomationViewReadinessOwner<Model>) {
  const subscribe = useCallback((listener: () => void) => owner.subscribe(listener), [owner]);
  const getSnapshot = useCallback(() => owner.getSnapshot(), [owner]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
