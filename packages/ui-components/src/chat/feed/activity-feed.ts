// What the chat knows about FluxIQ's live activity, and every request it makes
// for it. No DOM and no browser API: the activity port (the reads and the push
// subscription) comes in, so each rule below is tested directly.
//
// The client owns the state (the extension's background relay): the port's
// `read` and `setOverlay` answer `{ ok: true, value: { state } }` and its
// `subscribe` hears the state after each kept event or overlay change. This
// holds the latest of those, nothing merged.
//
// Reach, by what the client last answered:
//   loading      nothing yet
//   ready        a state arrived (a read reply or a push)
//   unsupported  the client cannot carry the request (the extension answers
//                "Unknown FluxIQ extension message." when its build has no
//                relay), so the chat shows offline and the overlay control is
//                off, for as long as the feed is mounted
//   failed       the read failed otherwise (typically a worker restart); the
//                next `read()` tries again
//
// A read reply that was asked for before a push arrived is older than that
// push, so it is dropped. The relay forgets everything on a worker restart,
// so `current: null` and `recent: []` are an ordinary state, not an error.

import type { ChatActivityPort, ChatActivityState, ChatOverlayPreference } from "../ports/index.ts";

/** How the client last answered. */
export type ActivityFeedReach = "loading" | "ready" | "unsupported" | "failed";

/** Everything the chat renders from the feed. */
export type ActivityFeedSnapshot = {
  reach: ActivityFeedReach;
  state: ChatActivityState;
  /** Why the last read failed, while `reach` is `failed`. */
  readError?: string | undefined;
  /** Why the last overlay change did not go; cleared by the next one. */
  overlayError?: string | undefined;
  /** An overlay change is on its way. */
  overlaySaving: boolean;
};

/** Hears a state the client pushed; it is checked before it is believed. */
export type ActivityPushListener = (state: unknown) => void;

/** What the feed reaches the client through. */
export type ActivityFeedDeps = {
  readonly activity: ChatActivityPort;
};

export type ActivityFeed = {
  snapshot(): ActivityFeedSnapshot;
  /** Starts listening for pushes. Idempotent. */
  start(): void;
  stop(): void;
  /** Reads the state again. Never rejects. */
  read(): Promise<void>;
  /** Asks the client to show the on-page overlay as `overlay`. Never rejects; does nothing where the client has no overlay. */
  setOverlay(overlay: ChatOverlayPreference): Promise<void>;
};

const EMPTY_STATE: ChatActivityState = { current: null, display: null, recent: [], overlay: "expanded", live: false };
const READ_FAILED = "Couldn't read activity. Try again.";
const OVERLAY_FAILED = "Couldn't change the on-page status. Try again.";

/** Creates the feed. `onChange` is called after every change to `snapshot()`. */
export function createActivityFeed(deps: ActivityFeedDeps, onChange: () => void): ActivityFeed {
  let reach: ActivityFeedReach = "loading";
  let state: ChatActivityState = EMPTY_STATE;
  let readError: string | undefined;
  let overlayError: string | undefined;
  let overlaySaving = false;
  let unsubscribe: (() => void) | undefined;
  // Lifecycle invalidates stopped subscriptions and requests. Observations
  // protect newer state; read generations also order replies without a push.
  let lifecycle = 0;
  let readGeneration = 0;
  let observations = 0;
  let listening = false;
  let overlayOperation: object | undefined;

  function take(next: ChatActivityState): void {
    observations += 1;
    state = next;
    if (reach !== "unsupported") {
      reach = "ready";
    }
    readError = undefined;
  }

  function onPush(pushed: unknown): void {
    if (!isActivityState(pushed)) {
      return;
    }
    take(pushed);
    onChange();
  }

  return {
    snapshot: () => ({ reach, state, readError, overlayError, overlaySaving }),
    start() {
      if (listening) {
        return;
      }
      listening = true;
      const started = lifecycle;
      const cleanup = deps.activity.subscribe((pushed) => {
        if (listening && started === lifecycle) {
          onPush(pushed);
        }
      });
      if (listening && started === lifecycle) {
        unsubscribe = cleanup;
      } else {
        cleanup();
      }
    },
    stop() {
      lifecycle += 1;
      readGeneration += 1;
      listening = false;
      overlayOperation = undefined;
      overlaySaving = false;
      const cleanup = unsubscribe;
      unsubscribe = undefined;
      cleanup?.();
    },
    async read() {
      if (reach === "unsupported") {
        return;
      }
      const asked = lifecycle;
      const generation = ++readGeneration;
      const observed = observations;
      const current = () => asked === lifecycle && generation === readGeneration && observed === observations && reach !== "unsupported";
      try {
        const result = await deps.activity.read();
        if (!current()) {
          return;
        }
        if (result.ok && isActivityState(result.value.state)) {
          take(result.value.state);
        } else if (!result.ok && result.unsupported) {
          reach = "unsupported";
        } else if (reach !== "ready") {
          reach = "failed";
          readError = result.ok ? "The extension answered with activity this panel can't read." : result.sentence;
        }
        onChange();
      } catch {
        if (!current()) {
          return;
        }
        if (reach !== "ready") {
          reach = "failed";
          readError = READ_FAILED;
        }
        onChange();
      }
    },
    async setOverlay(overlay) {
      const change = deps.activity.setOverlay?.bind(deps.activity);
      if (change === undefined || reach === "unsupported" || overlaySaving || overlay === state.overlay) {
        return;
      }
      const asked = lifecycle;
      const observed = observations;
      const operation = {};
      overlayOperation = operation;
      const current = () => asked === lifecycle && overlayOperation === operation;
      const supported = () => reach !== "unsupported";
      overlaySaving = true;
      overlayError = undefined;
      onChange();
      if (!current()) {
        return;
      }
      try {
        const result = await change(overlay);
        if (!current()) {
          return;
        }
        if (result.ok && isActivityState(result.value.state)) {
          if (observed === observations && supported()) {
            take(result.value.state);
          }
        } else if (!result.ok && result.unsupported) {
          reach = "unsupported";
        } else {
          overlayError = OVERLAY_FAILED;
        }
      } catch {
        if (current()) {
          overlayError = OVERLAY_FAILED;
        }
      } finally {
        if (current()) {
          overlayOperation = undefined;
          overlaySaving = false;
          onChange();
        }
      }
    }
  };
}

function isActivityState(value: unknown): value is ChatActivityState {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ChatActivityState>;
  return Array.isArray(candidate.recent)
    && (candidate.history === undefined || Array.isArray(candidate.history))
    && (candidate.current === null || (typeof candidate.current === "object" && candidate.current !== undefined))
    && (candidate.overlay === "expanded" || candidate.overlay === "collapsed" || candidate.overlay === "hidden")
    && typeof candidate.live === "boolean";
}
