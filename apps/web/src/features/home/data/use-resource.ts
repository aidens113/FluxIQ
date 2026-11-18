"use client";

import { useEffect, useRef, useState } from "react";
import { whenTabReturns } from "../../panel-shell/shared";
import type { Resource } from "./resource";

export type UseResourceOptions = {
  /** Reads again, from loading, when this changes (the project in view, say). */
  key?: string;
  /** False holds the section at loading until what it needs is known. */
  enabled?: boolean;
};

/**
 * Loads one section now, again whenever the person returns to the tab, and on `retry`. There is no timer.
 * A refresh that fails keeps the numbers from before, marked `stale`, so one bad round never blanks the page.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, options: UseResourceOptions = {}): Resource<T> {
  const { key = "", enabled = true } = options;
  const [resource, setResource] = useState<Resource<T>>({ state: "loading" });
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    setResource({ state: "loading" });
    if (!enabled) return undefined;
    const controller = new AbortController();
    let running = false;
    const ask = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        const data = await latest.current(controller.signal);
        if (!controller.signal.aborted) setResource({ state: "ready", data, retry: ask });
      } catch {
        if (!controller.signal.aborted) {
          setResource((was) => (was.state === "ready" ? { ...was, stale: true, retry: ask } : { state: "error", retry: ask }));
        }
      } finally {
        running = false;
      }
    };
    void ask();
    const stop = whenTabReturns(() => void ask());
    return () => {
      controller.abort();
      stop();
    };
  }, [key, enabled]);
  return resource;
}
