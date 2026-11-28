import type { PanelChangeTopic } from "./types";

// The person's current project and open Flow changed: read the client snapshot again
// (`GET /api/client-gateway/snapshot`, its `webRuntime.automationStudio`). Since t1095 the panel and every
// paired client write that one per-person value (`POST /api/client-gateway/automation-studio-context`), so
// an open panel follows a client's switch, and a client the panel's, without a tab focus or a timer.
//
// The writer and the streams are different route modules, which the panel server may bundle apart, so the
// listeners live in one registry on `globalThis` under a registered symbol: every bundle reaches the same
// one. A signal names nothing but the workspace and the person it is for; a stream hears only its own
// caller's, and what it then reads is the snapshot, decided for it as that route decides it.

/** Who a context change is for: the person, in the workspace their value is kept in. */
export type PanelContextOwner = { readonly workspaceId: string; readonly userId: string };

type Listeners = Map<string, Set<() => void>>;

const REGISTRY = Symbol.for("fluxiq.web.panel-context-changes");

function listeners(): Listeners {
  const holder = globalThis as { [REGISTRY]?: Listeners };
  holder[REGISTRY] ??= new Map();
  return holder[REGISTRY];
}

function keyOf(owner: PanelContextOwner): string {
  return JSON.stringify([owner.workspaceId, owner.userId]);
}

/** Where context changes are told and heard. */
export const panelContextChanges = Object.freeze({
  /** Tells every stream of `owner`'s that their current project or Flow changed; called once the write committed. */
  signal(owner: PanelContextOwner): void {
    for (const listener of [...(listeners().get(keyOf(owner)) ?? [])]) listener();
  },

  /** The topic a stream for `owner` holds: a `context` change at each signal for them. */
  topic(owner: PanelContextOwner): PanelChangeTopic {
    return {
      start(sink) {
        const key = keyOf(owner);
        const listener = () => sink.changed({ topic: "context" });
        const all = listeners();
        const set = all.get(key) ?? new Set();
        set.add(listener);
        all.set(key, set);
        return () => {
          set.delete(listener);
          if (set.size === 0 && all.get(key) === set) all.delete(key);
        };
      }
    };
  }
});
