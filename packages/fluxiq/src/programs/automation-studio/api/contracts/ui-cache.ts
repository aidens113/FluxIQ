import type { JsonValue } from "../../../../core/index.ts";

export type AutomationStudioProjectUiCacheEntry = {
  cacheKey: string;
  value: JsonValue;
  sizeBytes: number;
  updatedAt: number;
  contentRevision?: number;
  expiresAt?: number | null;
};

export type AutomationStudioProjectUiCachePutEntry = {
  cacheKey: string;
  value: JsonValue;
  contentRevision?: unknown;
  expiresAt?: unknown;
};

export type AutomationStudioGetProjectUiCacheRequest = {
  projectId: string;
  cacheKeys: string[];
};

export type AutomationStudioGetProjectUiCacheResponse = {
  entries: AutomationStudioProjectUiCacheEntry[];
  missingKeys: string[];
};

export type AutomationStudioSaveProjectUiCacheRequest = {
  projectId: string;
  entries: AutomationStudioProjectUiCachePutEntry[];
};

export type AutomationStudioSaveProjectUiCacheResponse = {
  entries: AutomationStudioProjectUiCacheEntry[];
};

export type AutomationStudioDeleteProjectUiCacheRequest = {
  projectId: string;
  cacheKeys?: string[];
};

export type AutomationStudioDeleteProjectUiCacheResponse = {
  deleted: number;
};

export type AutomationStudioListProjectUiCacheStatsRequest = {
  projectId?: string;
};

export type AutomationStudioProjectUiCacheStats = {
  projectId: string;
  entries: number;
  byteCount: number;
  expiredEntries: number;
  oldestUpdatedAt: number | null;
  newestUpdatedAt: number | null;
};

export type AutomationStudioListProjectUiCacheStatsResponse = {
  stats: AutomationStudioProjectUiCacheStats[];
};
