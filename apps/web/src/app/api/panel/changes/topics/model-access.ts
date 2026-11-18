import type { PanelChangeTopic } from "./types";

/**
 * Where a workspace's runtime says a person's model access may have changed (a
 * key added, removed, chosen or replaced, or a call on it refused, unreachable
 * or answered after a refusal). Each signal names nothing: it only says "read
 * the Secret Keys snapshot again".
 */
export type PanelModelAccessSource = {
  subscribe(listener: () => void): () => void;
};

/**
 * The model-access signal a workspace's program runtime holds, as
 * `GlobalProgramRuntime.modelAccessChanges` (the route's
 * `selected.fluxiq.programs`): an object with `subscribe(listener)` that
 * answers its unsubscribe. Read from that runtime instance itself, never from a
 * module of its own: the panel server bundles Core more than once, so a
 * module-level hub here would be a different object from the one the runtime
 * signals. The runtime carries it (`programs/_shared/runtime.ts`, t928); this
 * narrow accessor still answers undefined for an object without a source there,
 * and the route then leaves the topic out rather than failing the stream.
 */
export function panelModelAccessSource(programs: object): PanelModelAccessSource | undefined {
  const source: unknown = (programs as { modelAccessChanges?: unknown }).modelAccessChanges;
  if (typeof source !== "object" || source === null) return undefined;
  const subscribe: unknown = (source as { subscribe?: unknown }).subscribe;
  if (typeof subscribe !== "function") return undefined;
  return { subscribe: (listener) => (subscribe as PanelModelAccessSource["subscribe"]).call(source, listener) };
}

/**
 * Model access as a topic: a `model-access` change each time the runtime
 * signals one. The change carries nothing, so it is safe for any panel caller:
 * what they then read is the Secret Keys snapshot, decided for them as that
 * route decides it. A burst of signals is one change until the stream sends
 * it.
 */
export function modelAccessChangeTopic(source: PanelModelAccessSource): PanelChangeTopic {
  return {
    start(sink) {
      let stopped = false;
      const unsubscribe = source.subscribe(() => {
        if (!stopped) sink.changed({ topic: "model-access" });
      });
      return () => {
        stopped = true;
        unsubscribe();
      };
    }
  };
}
