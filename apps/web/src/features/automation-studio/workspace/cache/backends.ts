import {
  type AutomationStudioUiCacheBackend,
  type AutomationStudioUiCacheKeyParts,
  type AutomationStudioUiCacheKind,
  type AutomationStudioUiCacheTransport
} from "./contracts";

export const AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION = 1;
export const AUTOMATION_STUDIO_UI_CACHE_NAMESPACE = "fluxiq:automation-studio:ui-cache";
export const AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS = 500_000;

export class ProgramApiAutomationStudioUiCacheBackend implements AutomationStudioUiCacheBackend {
  constructor(
    private readonly transport: AutomationStudioUiCacheTransport,
    private readonly fallback: AutomationStudioUiCacheBackend = new LocalStorageAutomationStudioUiCacheBackend()
  ) {}

  async get<T>(key: string, options?: { signal?: AbortSignal }): Promise<T | undefined> {
    if (options?.signal?.aborted) return undefined;
    const fallbackValue = await this.fallback.get<T>(key, options).catch(() => undefined);
    if (fallbackValue !== undefined) return fallbackValue;
    const parts = parseAutomationStudioUiCacheKey(key);
    if (!parts) return undefined;
    const result = await this.transport.post<{ entries?: Array<{ value?: unknown }> }>(
      "get-project-ui-cache",
      { projectId: parts.projectId, cacheKeys: [parts.kind] },
      options
    ).catch(() => undefined);
    if (!result?.ok || options?.signal?.aborted) return undefined;
    const value = result.payload?.entries?.[0]?.value as T | undefined;
    if (value !== undefined && !automationStudioUiCacheValueFits(value)) return undefined;
    if (value !== undefined) await this.fallback.set(key, value, options).catch(() => undefined);
    return value;
  }

  async set<T>(key: string, value: T, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) return;
    if (!automationStudioUiCacheValueFits(value)) {
      await this.fallback.delete?.(key, options).catch(() => undefined);
      return;
    }
    await this.fallback.set(key, value, options).catch(() => undefined);
    if (options?.signal?.aborted) return;
    const parts = parseAutomationStudioUiCacheKey(key);
    if (!parts) return;
    await this.transport.post(
      "save-project-ui-cache",
      { projectId: parts.projectId, entries: [{ cacheKey: parts.kind, value }] },
      options
    ).catch(() => undefined);
  }

  async delete(key: string, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) return;
    await this.fallback.delete?.(key, options).catch(() => undefined);
    if (options?.signal?.aborted) return;
    const parts = parseAutomationStudioUiCacheKey(key);
    if (!parts) return;
    await this.transport.post(
      "delete-project-ui-cache",
      { projectId: parts.projectId, cacheKeys: [parts.kind] },
      options
    ).catch(() => undefined);
  }
}

export class LocalStorageAutomationStudioUiCacheBackend implements AutomationStudioUiCacheBackend {
  async get<T>(key: string, options?: { signal?: AbortSignal }): Promise<T | undefined> {
    if (options?.signal?.aborted) return undefined;
    if (typeof window === "undefined" || !window.localStorage) return undefined;
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    if (raw.length > AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS) {
      window.localStorage.removeItem(key);
      return undefined;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      window.localStorage.removeItem(key);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) return;
    if (typeof window === "undefined" || !window.localStorage) return;
    const raw = JSON.stringify(value);
    if (raw.length > AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS) {
      window.localStorage.removeItem(key);
      return;
    }
    if (!options?.signal?.aborted) window.localStorage.setItem(key, raw);
  }

  async delete(key: string, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) return;
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(key);
  }
}

export function automationStudioUiCacheKey(
  projectId: string,
  userId: string,
  kind: AutomationStudioUiCacheKind
): string {
  return [AUTOMATION_STUDIO_UI_CACHE_NAMESPACE, userId, projectId, kind].map(encodeURIComponent).join(":");
}

export function automationStudioUiCacheValueFits(value: unknown): boolean {
  try {
    return JSON.stringify(value).length <= AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS;
  } catch {
    return false;
  }
}

function parseAutomationStudioUiCacheKey(key: string): AutomationStudioUiCacheKeyParts | null {
  const parts = key.split(":").map((part) => {
    try { return decodeURIComponent(part); }
    catch { return ""; }
  });
  if (parts.length !== 4 || parts[0] !== AUTOMATION_STUDIO_UI_CACHE_NAMESPACE) return null;
  const kind = parts[3] as AutomationStudioUiCacheKind;
  if (kind !== "workspacePrefs" && kind !== "sidebar") return null;
  if (!parts[1] || !parts[2]) return null;
  return { userId: parts[1], projectId: parts[2], kind };
}
