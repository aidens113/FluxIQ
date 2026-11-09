import type { PipelineCachedCall, PipelineState } from "../types.ts";

/**
 * A pipeline state kept in memory, for tests and for a host with no store of its own.
 * It forgets everything when the process ends, so incremental runs only skip records
 * of earlier runs in this process; a host that must remember longer gives its own.
 */
export function createMemoryPipelineState(): PipelineState {
  const processed = new Set<string>();
  const cached = new Map<string, { call: PipelineCachedCall; expiresAt: number }>();
  const processedKey = (projectId: string, pipeline: string, stepId: string, key: string): string => JSON.stringify([projectId, pipeline, stepId, key]);
  return {
    isProcessed: async (projectId, pipeline, stepId, key) => processed.has(processedKey(projectId, pipeline, stepId, key)),
    markProcessed: async (projectId, pipeline, stepId, key) => {
      processed.add(processedKey(projectId, pipeline, stepId, key));
    },
    getCachedCall: async (projectId, callKey, now) => {
      const key = JSON.stringify([projectId, callKey]);
      const entry = cached.get(key);
      if (entry === undefined) return undefined;
      if (entry.expiresAt <= now) {
        cached.delete(key);
        return undefined;
      }
      return entry.call;
    },
    putCachedCall: async (projectId, callKey, call, expiresAt) => {
      cached.set(JSON.stringify([projectId, callKey]), { call, expiresAt });
    }
  };
}
