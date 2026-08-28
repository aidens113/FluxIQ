"use client";

import { useMemo } from "react";
import type { AutomationHierarchyKind } from "../hierarchy/model";
import { normalizeAutomationWorkspacePrefs, type AutomationWorkspacePrefs } from "../workspace/layout";

export const AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION = 1;
export const AUTOMATION_STUDIO_UI_CACHE_NAMESPACE = "fluxiq:automation-studio:ui-cache";
export const AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS = 500_000;

export type AutomationProjectTreeUiState = {
  collapsedFolderIds: string[];
  expandedDefaultCollapsedIds: string[];
  focusedTreeNodeId: string;
  primaryTreeNodeId: string | null;
};

export type AutomationStudioSidebarUiState = AutomationProjectTreeUiState & {
  search: string;
  typeFilter: "all" | AutomationHierarchyKind;
};

export type AutomationStudioCachedUiState = {
  workspacePrefs?: AutomationWorkspacePrefs;
  sidebar?: AutomationStudioSidebarUiState;
};

type AutomationStudioUiCacheKind = keyof AutomationStudioCachedUiState;

type AutomationStudioUiCacheEnvelope<T> = {
  schemaVersion: typeof AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION;
  projectId: string;
  userId: string;
  kind: AutomationStudioUiCacheKind;
  updatedAt: number;
  value: T;
};

export interface AutomationStudioUiCacheBackend {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete?(key: string): Promise<void>;
}

type PendingWrite = ReturnType<typeof setTimeout>;
type AutomationStudioUiCacheProgramApi = {
  post<T = unknown>(endpoint: string, payload: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<{ ok: boolean; payload?: T; error?: string; aborted?: boolean }>;
};

type AutomationStudioUiCacheKeyParts = {
  projectId: string;
  userId: string;
  kind: AutomationStudioUiCacheKind;
};

type HydrateWorkspacePrefsInput = {
  projectId: string;
  userId: string;
  durablePrefs: AutomationWorkspacePrefs;
  onHydrate(prefs: AutomationWorkspacePrefs): void;
};

type HydrateSidebarInput = {
  projectId: string;
  userId: string;
  onHydrate(sidebar: AutomationStudioSidebarUiState): void;
};

type ScheduleWorkspacePrefsWriteInput = {
  projectId: string;
  userId: string;
  prefs: AutomationWorkspacePrefs;
  delayMs?: number;
};

type ScheduleSidebarWriteInput = {
  projectId: string;
  userId: string;
  sidebar: AutomationStudioSidebarUiState;
  delayMs?: number;
};

export class AutomationStudioUiCacheCoordinator {
  private readonly backend: AutomationStudioUiCacheBackend;
  private readonly pendingWrites = new Map<string, PendingWrite>();
  private readonly projectGenerations = new Map<string, number>();

  constructor(backend: AutomationStudioUiCacheBackend = new LocalStorageAutomationStudioUiCacheBackend()) {
    this.backend = backend;
  }

  markProjectUiMutation(projectId: string): void {
    this.projectGenerations.set(projectId, (this.projectGenerations.get(projectId) ?? 0) + 1);
  }

  hydrateWorkspacePrefs(input: HydrateWorkspacePrefsInput): void {
    const generation = this.projectGenerations.get(input.projectId) ?? 0;
    this.scheduleBackground(async () => {
      const envelope = await this.readEnvelope<AutomationWorkspacePrefs>(input.projectId, input.userId, "workspacePrefs");
      if (!envelope) return;
      if ((this.projectGenerations.get(input.projectId) ?? 0) !== generation) return;
      const durableUpdatedAt = Number((input.durablePrefs as unknown as Record<string, unknown>).updatedAt ?? 0);
      if (durableUpdatedAt && envelope.updatedAt < durableUpdatedAt) return;
      input.onHydrate(normalizeAutomationWorkspacePrefs(envelope.value));
    });
  }

  hydrateSidebar(input: HydrateSidebarInput): void {
    const generation = this.projectGenerations.get(input.projectId) ?? 0;
    this.scheduleBackground(async () => {
      const envelope = await this.readEnvelope<AutomationStudioSidebarUiState>(input.projectId, input.userId, "sidebar");
      if (!envelope) return;
      if ((this.projectGenerations.get(input.projectId) ?? 0) !== generation) return;
      input.onHydrate(normalizeAutomationStudioSidebarUiState(envelope.value));
    });
  }

  scheduleWorkspacePrefsWrite(input: ScheduleWorkspacePrefsWriteInput): void {
    const key = this.cacheKey(input.projectId, input.userId, "workspacePrefs");
    this.scheduleWrite(key, input.delayMs ?? 500, async () => {
      await this.writeEnvelope(input.projectId, input.userId, "workspacePrefs", normalizeAutomationWorkspacePrefs(input.prefs));
    });
  }

  scheduleSidebarWrite(input: ScheduleSidebarWriteInput): void {
    const key = this.cacheKey(input.projectId, input.userId, "sidebar");
    this.scheduleWrite(key, input.delayMs ?? 300, async () => {
      await this.writeEnvelope(input.projectId, input.userId, "sidebar", normalizeAutomationStudioSidebarUiState(input.sidebar));
    });
  }

  cancelProject(projectId: string): void {
    this.projectGenerations.set(projectId, (this.projectGenerations.get(projectId) ?? 0) + 1);
    for (const [key, timeout] of this.pendingWrites) {
      if (key.includes(`:${projectId}:`)) {
        clearTimeout(timeout);
        this.pendingWrites.delete(key);
      }
    }
  }

  private scheduleWrite(key: string, delayMs: number, task: () => Promise<void>): void {
    const existing = this.pendingWrites.get(key);
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(() => {
      this.pendingWrites.delete(key);
      this.scheduleBackground(async () => {
        await task().catch(() => undefined);
      });
    }, delayMs);
    this.pendingWrites.set(key, timeout);
  }

  private async readEnvelope<T>(projectId: string, userId: string, kind: AutomationStudioUiCacheKind): Promise<AutomationStudioUiCacheEnvelope<T> | undefined> {
    const value = await this.backend.get<AutomationStudioUiCacheEnvelope<T>>(this.cacheKey(projectId, userId, kind)).catch(() => undefined);
    if (!isAutomationStudioUiCacheEnvelope<T>(value, projectId, userId, kind)) return undefined;
    return value;
  }

  private async writeEnvelope<T>(projectId: string, userId: string, kind: AutomationStudioUiCacheKind, value: T): Promise<void> {
    await this.backend.set(this.cacheKey(projectId, userId, kind), {
      schemaVersion: AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION,
      projectId,
      userId,
      kind,
      updatedAt: Date.now(),
      value
    } satisfies AutomationStudioUiCacheEnvelope<T>);
  }

  private cacheKey(projectId: string, userId: string, kind: AutomationStudioUiCacheKind): string {
    return [AUTOMATION_STUDIO_UI_CACHE_NAMESPACE, userId, projectId, kind].map(encodeURIComponent).join(":");
  }

  private scheduleBackground(task: () => void | Promise<void>): void {
    scheduleAutomationStudioUiCacheBackgroundTask(task);
  }
}

export class ProgramApiAutomationStudioUiCacheBackend implements AutomationStudioUiCacheBackend {
  private readonly fallback: AutomationStudioUiCacheBackend;

  constructor(private readonly api: AutomationStudioUiCacheProgramApi, fallback: AutomationStudioUiCacheBackend = new LocalStorageAutomationStudioUiCacheBackend()) {
    this.fallback = fallback;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const fallbackValue = await this.fallback.get<T>(key).catch(() => undefined);
    if (fallbackValue !== undefined) return fallbackValue;
    const parts = parseAutomationStudioUiCacheKey(key);
    if (!parts) return undefined;
    const result = await this.api.post<{ entries?: Array<{ value?: unknown }> }>("get-project-ui-cache", { projectId: parts.projectId, cacheKeys: [parts.kind] }).catch(() => undefined);
    if (!result?.ok) return undefined;
    const value = result.payload?.entries?.[0]?.value as T | undefined;
    if (value !== undefined) await this.fallback.set(key, value).catch(() => undefined);
    return value;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.fallback.set(key, value).catch(() => undefined);
    const parts = parseAutomationStudioUiCacheKey(key);
    if (!parts) return;
    await this.api.post("save-project-ui-cache", { projectId: parts.projectId, entries: [{ cacheKey: parts.kind, value }] }).catch(() => undefined);
  }

  async delete(key: string): Promise<void> {
    await this.fallback.delete?.(key).catch(() => undefined);
    const parts = parseAutomationStudioUiCacheKey(key);
    if (!parts) return;
    await this.api.post("delete-project-ui-cache", { projectId: parts.projectId, cacheKeys: [parts.kind] }).catch(() => undefined);
  }
}
export class LocalStorageAutomationStudioUiCacheBackend implements AutomationStudioUiCacheBackend {
  async get<T>(key: string): Promise<T | undefined> {
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

  async set<T>(key: string, value: T): Promise<void> {
    if (typeof window === "undefined" || !window.localStorage) return;
    const raw = JSON.stringify(value);
    if (raw.length > AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, raw);
  }

  async delete(key: string): Promise<void> {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(key);
  }
}

export function useAutomationStudioUiCacheCoordinator(backend?: AutomationStudioUiCacheBackend): AutomationStudioUiCacheCoordinator {
  return useMemo(() => new AutomationStudioUiCacheCoordinator(backend), [backend]);
}

export function normalizeAutomationProjectTreeUiState(value: Partial<AutomationProjectTreeUiState> | undefined): AutomationProjectTreeUiState {
  return {
    collapsedFolderIds: stringArray(value?.collapsedFolderIds),
    expandedDefaultCollapsedIds: stringArray(value?.expandedDefaultCollapsedIds),
    focusedTreeNodeId: typeof value?.focusedTreeNodeId === "string" && value.focusedTreeNodeId ? value.focusedTreeNodeId : "root-flow",
    primaryTreeNodeId: typeof value?.primaryTreeNodeId === "string" && value.primaryTreeNodeId ? value.primaryTreeNodeId : null
  };
}

export function normalizeAutomationStudioSidebarUiState(value: Partial<AutomationStudioSidebarUiState> | undefined): AutomationStudioSidebarUiState {
  const treeState = normalizeAutomationProjectTreeUiState(value);
  return {
    ...treeState,
    search: typeof value?.search === "string" ? value.search.slice(0, 240) : "",
    typeFilter: isAutomationHierarchyTypeFilter(value?.typeFilter) ? value.typeFilter : "all"
  };
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
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 500) : [];
}

function isAutomationHierarchyTypeFilter(value: unknown): value is "all" | AutomationHierarchyKind {
  return typeof value === "string" && ["all", "folder", "client", "proposal", "change-proposal", "flow", "flow-object", "instruction", "adaptation", "config", "recording", "run", "task", "routine", "subflow"].includes(value);
}

function isAutomationStudioUiCacheEnvelope<T>(value: unknown, projectId: string, userId: string, kind: AutomationStudioUiCacheKind): value is AutomationStudioUiCacheEnvelope<T> {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as AutomationStudioUiCacheEnvelope<T>).schemaVersion === AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION
    && (value as AutomationStudioUiCacheEnvelope<T>).projectId === projectId
    && (value as AutomationStudioUiCacheEnvelope<T>).userId === userId
    && (value as AutomationStudioUiCacheEnvelope<T>).kind === kind
    && typeof (value as AutomationStudioUiCacheEnvelope<T>).updatedAt === "number";
}

function scheduleAutomationStudioUiCacheBackgroundTask(task: () => void | Promise<void>): void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const idleWindow = window as Window & { requestIdleCallback(callback: IdleRequestCallback, options?: IdleRequestOptions): number };
    idleWindow.requestIdleCallback(() => { void task(); }, { timeout: 1_500 });
    return;
  }
  setTimeout(() => { void task(); }, 0);
}
