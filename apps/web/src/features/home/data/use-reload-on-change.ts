"use client";

import { useEffect, useRef } from "react";
import type { Resource } from "./resource";

/**
 * Reads `resource` again each time `revision` moves, so a section follows a live source (the client gateway's
 * change stream) without a timer. The reading it already has stays on screen while the new one loads. The first
 * `revision` seen is the one the section loaded with; only later ones read again.
 */
export function useReloadOnChange(resource: Resource<unknown>, revision: number): void {
  const retry = useRef<(() => void) | undefined>(undefined);
  retry.current = resource.state === "loading" ? undefined : resource.retry;
  const seen = useRef(revision);
  useEffect(() => {
    if (seen.current === revision) return;
    seen.current = revision;
    retry.current?.();
  }, [revision]);
}
