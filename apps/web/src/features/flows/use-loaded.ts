"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A read the screen shows: still loading, could not be read (with the engine's words), or here. */
export type Loaded<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

/**
 * Runs `load` when `key` changes and when `reload` is called; an earlier read still in flight is
 * cancelled, so an old answer never replaces a newer one. A read that fails shows as failed:
 * what was shown before would read as current.
 */
export function useLoaded<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): Loaded<T> & { reload(): void } {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  const [round, setRound] = useState(0);
  const latest = useRef(load);
  latest.current = load;
  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    if (key === null) return undefined;
    const controller = new AbortController();
    // A reload of the same thing keeps what is shown until the answer comes; another thing starts blank.
    const same = shownKey.current === key;
    shownKey.current = key;
    setLoaded((was) => (same && was.state === "ready" ? was : { state: "loading" }));
    latest.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setLoaded({ state: "ready", data });
      },
      (error: unknown) => {
        /* best-effort: a cancelled read belongs to a screen no longer shown, and the newer read reports its own failure */
        if (controller.signal.aborted) return;
        setLoaded({ state: "error", message: error instanceof Error ? error.message : String(error) });
      }
    );
    return () => controller.abort();
  }, [key, round]);
  const reload = useCallback(() => setRound((value) => value + 1), []);
  return { ...loaded, reload };
}
