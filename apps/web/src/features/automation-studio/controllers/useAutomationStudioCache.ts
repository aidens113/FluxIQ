"use client";

import { useEffect, useRef } from "react";

export type AutomationStudioCacheScope = "summary" | "flow" | "recording" | "proposal" | "timeline" | "flow-metadata" | "node-definitions" | "subflow";
type CacheEntry = { value: unknown; storedAt: number };

export class AutomationStudioDataCache {
  private readonly entries = new Map<string, CacheEntry>();

  private key(scope: AutomationStudioCacheScope, projectId: string, resourceId: string): string {
    return `${scope}:${projectId}:${resourceId}`;
  }

  get<T>(scope: AutomationStudioCacheScope, projectId: string, resourceId = "root", maxAgeMs = 30_000, now = Date.now()): T | undefined {
    const key = this.key(scope, projectId, resourceId);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now - entry.storedAt > maxAgeMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(scope: AutomationStudioCacheScope, projectId: string, resourceId: string, value: T, now = Date.now()): T {
    this.entries.set(this.key(scope, projectId, resourceId), { value, storedAt: now });
    return value;
  }

  invalidateProject(projectId: string): void {
    for (const key of this.entries.keys()) {
      if (key.includes(`:${projectId}:`)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export function useAutomationStudioCache(): AutomationStudioDataCache {
  const cacheRef = useRef(new AutomationStudioDataCache());
  useEffect(() => {
    function invalidate(event: Event) {
      const detail = (event as CustomEvent<{ programId?: string; projectId?: string }>).detail;
      if (detail?.programId === "automation-studio" && detail.projectId) cacheRef.current.invalidateProject(detail.projectId);
    }
    window.addEventListener("program-api:mutation", invalidate);
    return () => {
      window.removeEventListener("program-api:mutation", invalidate);
      cacheRef.current.clear();
    };
  }, []);
  return cacheRef.current;
}
