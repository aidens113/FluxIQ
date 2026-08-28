"use client";

import { useEffect, useRef } from "react";

export type AutomationStudioCacheScope = "summary" | "flow" | "recording" | "proposal" | "timeline" | "flow-metadata" | "node-definitions" | "subflow";
type CacheEntry = { value: unknown; storedAt: number; estimatedBytes: number };
export type AutomationStudioCacheStats = {
  entryCount: number;
  estimatedBytes: number;
  scopes: Record<string, number>;
};

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
      this.emitStats();
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(scope: AutomationStudioCacheScope, projectId: string, resourceId: string, value: T, now = Date.now()): T {
    this.entries.set(this.key(scope, projectId, resourceId), { value, storedAt: now, estimatedBytes: estimateAutomationStudioCacheValueBytes(value) });
    this.emitStats();
    return value;
  }

  invalidateProject(projectId: string): void {
    for (const key of this.entries.keys()) {
      if (key.includes(`:${projectId}:`)) this.entries.delete(key);
    }
    this.emitStats();
  }

  invalidateScopes(projectId: string, scopes: readonly AutomationStudioCacheScope[], resourceIds: readonly string[] = []): void {
    const scopeSet = new Set(scopes);
    const resourceSet = new Set(resourceIds.filter(Boolean));
    for (const key of this.entries.keys()) {
      const [scope, cachedProjectId, resourceId] = key.split(":");
      if (cachedProjectId !== projectId || !scopeSet.has(scope as AutomationStudioCacheScope)) continue;
      if (resourceSet.size && resourceId && !resourceSet.has(resourceId) && !resourceSet.has("root")) continue;
      this.entries.delete(key);
    }
    this.emitStats();
  }

  clear(): void {
    this.entries.clear();
    this.emitStats();
  }

  get size(): number {
    return this.entries.size;
  }

  stats(): AutomationStudioCacheStats {
    const scopes: Record<string, number> = {};
    let estimatedBytes = 0;
    for (const [key, entry] of this.entries) {
      const scope = key.split(":", 1)[0] ?? "unknown";
      scopes[scope] = (scopes[scope] ?? 0) + 1;
      estimatedBytes += entry.estimatedBytes;
    }
    return { entryCount: this.entries.size, estimatedBytes, scopes };
  }

  private emitStats(): void {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<AutomationStudioCacheStats>("automation-studio:cache-metric", { detail: this.stats() }));
  }
}

export function useAutomationStudioCache(): AutomationStudioDataCache {
  const cacheRef = useRef<AutomationStudioDataCache | null>(null);
  if (!cacheRef.current) cacheRef.current = new AutomationStudioDataCache();
  const cache = cacheRef.current;
  useEffect(() => {
    function invalidate(event: Event) {
      const detail = (event as CustomEvent<{ programId?: string; projectId?: string; cacheScopes?: AutomationStudioCacheScope[]; resourceIds?: string[] }>).detail;
      if (detail?.programId !== "automation-studio" || !detail.projectId) return;
      if (detail.cacheScopes?.length && detail.resourceIds?.length) cache.invalidateScopes(detail.projectId, detail.cacheScopes, detail.resourceIds);
    }
    window.addEventListener("program-api:mutation", invalidate);
    return () => {
      window.removeEventListener("program-api:mutation", invalidate);
      cache.clear();
    };
  }, [cache]);
  return cache;
}

export function estimateAutomationStudioCacheValueBytes(value: unknown, depth = 0): number {
  if (value == null) return 0;
  if (typeof value === "string") return value.length * 2;
  if (typeof value === "number" || typeof value === "boolean") return 8;
  if (typeof value === "bigint") return 16;
  if (typeof value !== "object") return 32;
  if (depth >= 3) return 96;
  if (Array.isArray(value)) {
    const sample = value.slice(0, 25);
    const sampledBytes = sample.reduce((total, item) => total + estimateAutomationStudioCacheValueBytes(item, depth + 1), 0);
    const average = sample.length ? sampledBytes / sample.length : 0;
    return Math.round(24 + value.length * 8 + average * value.length);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const sampledKeys = keys.slice(0, 50);
  const sampledBytes = sampledKeys.reduce((total, key) => total + key.length * 2 + estimateAutomationStudioCacheValueBytes(record[key], depth + 1), 0);
  const average = sampledKeys.length ? sampledBytes / sampledKeys.length : 0;
  return Math.round(32 + keys.length * 16 + average * keys.length);
}
