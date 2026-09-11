import {
  AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES,
  AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES,
  AUTOMATION_STUDIO_UI_CACHE_MAX_KEY_BYTES,
  type AutomationStudioUiCacheEntry,
  type AutomationStudioUiCachePutEntry,
  type AutomationStudioUiCacheStats,
  type AutomationStudioUiCacheStore
} from "../../storage/index.ts";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioProjectStore } from "./projects/index.ts";

// The per-user UI cache: request validation, the store itself, and the shape
// the API returns. Every entry is scoped to a project and a user, so each call
// resolves the project first exactly as the monolithic service did.
export class AutomationStudioServiceUiCache {
  constructor(
    private readonly store: AutomationStudioUiCacheStore,
    private readonly projects: AutomationStudioProjectStore
  ) {}

  async getProjectUiCache(input: { projectId: string; userId: string; cacheKeys: unknown }): Promise<{ entries: Array<Omit<AutomationStudioUiCacheEntry, "projectId" | "userId">>; missingKeys: string[] }> {
    await this.projects.findProject(input.projectId);
    const userId = normalizeUiCacheUserId(input.userId);
    const cacheKeys = normalizeUiCacheKeyBatch(input.cacheKeys, "cacheKeys");
    const entries = await this.store.get({ projectId: input.projectId, userId, cacheKeys });
    const foundKeys = new Set(entries.map((entry) => entry.cacheKey));
    return {
      entries: entries.map(projectUiCacheEntryForApi),
      missingKeys: cacheKeys.filter((cacheKey) => !foundKeys.has(cacheKey))
    };
  }

  async saveProjectUiCache(input: { projectId: string; userId: string; entries: unknown }): Promise<{ entries: Array<Omit<AutomationStudioUiCacheEntry, "projectId" | "userId">> }> {
    await this.projects.findProject(input.projectId);
    const userId = normalizeUiCacheUserId(input.userId);
    const entries = normalizeUiCachePutEntryBatch(input.entries);
    const saved = await this.store.putBatch({ projectId: input.projectId, userId, entries });
    return { entries: saved.map(projectUiCacheEntryForApi) };
  }

  async deleteProjectUiCache(input: { projectId: string; userId: string; cacheKeys?: unknown }): Promise<{ deleted: number }> {
    await this.projects.findProject(input.projectId);
    const userId = normalizeUiCacheUserId(input.userId);
    const cacheKeys = input.cacheKeys === undefined || input.cacheKeys === null ? undefined : normalizeUiCacheKeyBatch(input.cacheKeys, "cacheKeys");
    return await this.store.delete({ projectId: input.projectId, userId, ...(cacheKeys ? { cacheKeys } : {}) });
  }

  async listProjectUiCacheStats(input: { projectId?: unknown; userId: string }): Promise<{ stats: Array<Omit<AutomationStudioUiCacheStats, "userId"> & { entryCount: number; totalBytes: number; updatedAt: number | null }> }> {
    const userId = normalizeUiCacheUserId(input.userId);
    const projectId = typeof input.projectId === "string" && input.projectId.trim() ? input.projectId.trim() : undefined;
    if (projectId) await this.projects.findProject(projectId);
    const stats = await this.store.stats({ userId, ...(projectId ? { projectId } : {}) });
    return {
      stats: stats.map(({ userId: _userId, ...entry }) => ({
        ...entry,
        entryCount: entry.entries,
        totalBytes: entry.byteCount,
        updatedAt: entry.newestUpdatedAt
      }))
    };
  }

  async close(): Promise<void> {
    await this.store.close();
  }

  async purgeProject(projectId: string): Promise<{ deleted: number }> {
    return await this.store.delete({ projectId });
  }
}

function normalizeUiCacheUserId(userId: string): string {
  const normalized = userId.trim();
  if (!normalized) throw new Error("Automation Studio UI cache requires an authenticated user.");
  return normalized;
}

function normalizeUiCacheKeyBatch(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Automation Studio UI cache ${fieldName} must be an array.`);
  if (value.length > AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES) {
    throw new Error(`Automation Studio UI cache accepts at most ${AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES} keys per request.`);
  }
  return value.map((item, index) => normalizeUiCacheKey(item, `${fieldName}[${index}]`));
}

function normalizeUiCachePutEntryBatch(value: unknown): AutomationStudioUiCachePutEntry[] {
  if (!Array.isArray(value)) throw new Error("Automation Studio UI cache entries must be an array.");
  if (value.length > AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES) {
    throw new Error(`Automation Studio UI cache accepts at most ${AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES} entries per request.`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Automation Studio UI cache entries[${index}] must be an object.`);
    const entry = item as { cacheKey?: unknown; value?: unknown; contentRevision?: unknown; expiresAt?: unknown };
    const value = normalizeUiCacheJsonValue(entry.value, `entries[${index}].value`);
    const sizeBytes = jsonValueSizeBytes(value);
    if (sizeBytes > AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES) {
      throw new Error(`Automation Studio UI cache entries[${index}] exceeds ${AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES} bytes.`);
    }
    const contentRevision = entry.contentRevision === undefined ? undefined : clampOptionalUiCacheNumber(entry.contentRevision, `entries[${index}].contentRevision`);
    const expiresAt = entry.expiresAt === undefined || entry.expiresAt === null ? entry.expiresAt as null | undefined : clampOptionalUiCacheNumber(entry.expiresAt, `entries[${index}].expiresAt`);
    return {
      cacheKey: normalizeUiCacheKey(entry.cacheKey, `entries[${index}].cacheKey`),
      value,
      sizeBytes,
      ...(contentRevision !== undefined ? { contentRevision } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {})
    };
  });
}

function normalizeUiCacheKey(value: unknown, fieldName: string): string {
  const cacheKey = typeof value === "string" ? value.trim() : "";
  if (!cacheKey) throw new Error(`Automation Studio UI cache ${fieldName} is required.`);
  if (Buffer.byteLength(cacheKey, "utf8") > AUTOMATION_STUDIO_UI_CACHE_MAX_KEY_BYTES) {
    throw new Error(`Automation Studio UI cache ${fieldName} exceeds ${AUTOMATION_STUDIO_UI_CACHE_MAX_KEY_BYTES} bytes.`);
  }
  return cacheKey;
}

function normalizeUiCacheJsonValue(value: unknown, fieldName: string): JsonValue {
  if (value === undefined) throw new Error(`Automation Studio UI cache ${fieldName} is required.`);
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error(`Automation Studio UI cache ${fieldName} must be JSON serializable.`);
  return JSON.parse(serialized) as JsonValue;
}

function jsonValueSizeBytes(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function clampOptionalUiCacheNumber(value: unknown, fieldName: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`Automation Studio UI cache ${fieldName} must be a non-negative number.`);
  return Math.trunc(numeric);
}

function projectUiCacheEntryForApi(entry: AutomationStudioUiCacheEntry): Omit<AutomationStudioUiCacheEntry, "projectId" | "userId"> {
  return {
    cacheKey: entry.cacheKey,
    value: structuredClone(entry.value),
    sizeBytes: entry.sizeBytes,
    updatedAt: entry.updatedAt,
    ...(entry.contentRevision !== undefined ? { contentRevision: entry.contentRevision } : {}),
    ...(entry.expiresAt !== undefined ? { expiresAt: entry.expiresAt } : {})
  };
}
