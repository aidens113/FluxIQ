import { tabIsHidden } from "./tab-is-hidden";
import { whenTabReturns } from "./when-tab-returns";

export type SharedSource<S> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => S;
  /** Reads again now; does nothing while a read is already running. */
  refresh: () => void;
};

export type SharedSourceOptions<S> = {
  initial: S;
  /** Reads the next state from the previous one. */
  read: (previous: S, signal: AbortSignal) => Promise<S>;
  /** The state readers see when a read throws, so a failure shows instead of vanishing. Receives the previous state and the cause. */
  failed: (previous: S, cause: unknown) => S;
  /** Also read on this interval, but never while the tab is hidden. Absent means no polling. */
  pollMs?: number;
  /** Extra reasons to read again. Receives `refresh`, returns the way to stop. */
  listen?: (refresh: () => void) => () => void;
};

/**
 * One reading shared by every component that subscribes: it is read once when the first one appears,
 * again when the tab is returned to (and on an optional interval that pauses while the tab is hidden),
 * and never twice at once. The last state stays when everyone has gone.
 */
export function createSharedSource<S>(options: SharedSourceOptions<S>): SharedSource<S> {
  let state = options.initial;
  const listeners = new Set<() => void>();
  let controller: AbortController | undefined;
  let stops: Array<() => void> = [];

  const refresh = () => {
    if (controller) return;
    const mine = new AbortController();
    controller = mine;
    const settle = (next: S) => {
      if (mine.signal.aborted) return;
      state = next;
      controller = undefined;
      listeners.forEach((listener) => listener());
    };
    void options.read(state, mine.signal).then(settle, (cause: unknown) => settle(options.failed(state, cause)));
  };

  const start = () => {
    refresh();
    stops = [whenTabReturns(refresh)];
    if (options.listen) stops.push(options.listen(refresh));
    if (options.pollMs) {
      const timer = setInterval(() => {
        if (!tabIsHidden()) refresh();
      }, options.pollMs);
      stops.push(() => clearInterval(timer));
    }
  };

  const stop = () => {
    stops.forEach((undo) => undo());
    stops = [];
    controller?.abort();
    controller = undefined;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot: () => state,
    refresh
  };
}
