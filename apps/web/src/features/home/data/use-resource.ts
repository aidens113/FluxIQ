"use client";

import { useEffect, useRef, useState } from "react";
import type { Resource } from "./resource";

const REFRESH_MS = 30_000;

/**
 * Loads one section now and every half minute. A refresh that fails turns the section to its error:
 * numbers from before the failure would read as current.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>): Resource<T> {
  const [resource, setResource] = useState<Resource<T>>({ state: "loading" });
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    const controller = new AbortController();
    const ask = async () => {
      try {
        const data = await latest.current(controller.signal);
        if (!controller.signal.aborted) setResource({ state: "ready", data });
      } catch {
        if (!controller.signal.aborted) setResource({ state: "error" });
      }
    };
    void ask();
    const timer = setInterval(() => void ask(), REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  return resource;
}
