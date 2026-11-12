"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Resource } from "../../home/data";

const REFRESH_MS = 30_000;

/** Like the home screen's resource, plus `reload` for after a change, which shows the new data without a loading flash. */
export function useReloadableResource<T>(load: (signal: AbortSignal) => Promise<T>): { resource: Resource<T>; reload: () => void } {
  const [resource, setResource] = useState<Resource<T>>({ state: "loading" });
  const [version, setVersion] = useState(0);
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
  }, [version]);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  return { resource, reload };
}
