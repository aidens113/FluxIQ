import { normalizeAutomationHierarchySidebarUiState, type AutomationHierarchySidebarUiState } from "../../hierarchy/ui-coordinator";
import { normalizeAutomationWorkspacePrefs, type AutomationWorkspacePrefs } from "../layout";
import {
  AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION,
  automationStudioUiCacheKey,
  LocalStorageAutomationStudioUiCacheBackend
} from "./backends";
import type {
  AutomationStudioUiCacheBackend,
  AutomationStudioUiCacheEnvelope,
  AutomationStudioUiCacheKind,
  AutomationStudioUiCachePort
} from "./contracts";

type PendingWrite = ReturnType<typeof setTimeout>;

export class AutomationStudioUiCacheCoordinator implements AutomationStudioUiCachePort {
  private readonly pendingWrites = new Map<string, PendingWrite>();
  private readonly projectGenerations = new Map<string, number>();

  constructor(private readonly backend: AutomationStudioUiCacheBackend = new LocalStorageAutomationStudioUiCacheBackend()) {}

  markProjectUiMutation(projectId: string): void {
    this.projectGenerations.set(projectId, (this.projectGenerations.get(projectId) ?? 0) + 1);
  }

  hydrateWorkspacePrefs(input: {
    projectId: string;
    userId: string;
    durablePrefs: AutomationWorkspacePrefs;
    onHydrate(prefs: AutomationWorkspacePrefs): void;
  }): void {
    const generation = this.projectGenerations.get(input.projectId) ?? 0;
    scheduleBackground(async () => {
      const envelope = await this.readEnvelope<AutomationWorkspacePrefs>(input.projectId, input.userId, "workspacePrefs");
      if (!envelope || (this.projectGenerations.get(input.projectId) ?? 0) !== generation) return;
      const durableUpdatedAt = Number((input.durablePrefs as unknown as Record<string, unknown>).updatedAt ?? 0);
      if (durableUpdatedAt && envelope.updatedAt < durableUpdatedAt) return;
      input.onHydrate(normalizeAutomationWorkspacePrefs(envelope.value));
    });
  }

  hydrateSidebar(input: {
    projectId: string;
    userId: string;
    onHydrate(sidebar: AutomationHierarchySidebarUiState): void;
  }): void {
    const generation = this.projectGenerations.get(input.projectId) ?? 0;
    scheduleBackground(async () => {
      const envelope = await this.readEnvelope<AutomationHierarchySidebarUiState>(input.projectId, input.userId, "sidebar");
      if (!envelope || (this.projectGenerations.get(input.projectId) ?? 0) !== generation) return;
      input.onHydrate(normalizeAutomationHierarchySidebarUiState(envelope.value));
    });
  }

  scheduleWorkspacePrefsWrite(input: {
    projectId: string;
    userId: string;
    prefs: AutomationWorkspacePrefs;
    delayMs?: number;
  }): void {
    const key = automationStudioUiCacheKey(input.projectId, input.userId, "workspacePrefs");
    this.scheduleWrite(key, input.delayMs ?? 500, async () => {
      await this.writeEnvelope(input.projectId, input.userId, "workspacePrefs", normalizeAutomationWorkspacePrefs(input.prefs));
    });
  }

  scheduleSidebarWrite(input: {
    projectId: string;
    userId: string;
    sidebar: AutomationHierarchySidebarUiState;
    delayMs?: number;
  }): void {
    const key = automationStudioUiCacheKey(input.projectId, input.userId, "sidebar");
    this.scheduleWrite(key, input.delayMs ?? 300, async () => {
      await this.writeEnvelope(input.projectId, input.userId, "sidebar", normalizeAutomationHierarchySidebarUiState(input.sidebar));
    });
  }

  cancelProject(projectId: string): void {
    this.projectGenerations.set(projectId, (this.projectGenerations.get(projectId) ?? 0) + 1);
    for (const [key, timeout] of this.pendingWrites) {
      if (!key.includes(":" + projectId + ":")) continue;
      clearTimeout(timeout);
      this.pendingWrites.delete(key);
    }
  }

  private scheduleWrite(key: string, delayMs: number, task: () => Promise<void>): void {
    const existing = this.pendingWrites.get(key);
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(() => {
      this.pendingWrites.delete(key);
      scheduleBackground(async () => { await task().catch(() => undefined); });
    }, delayMs);
    this.pendingWrites.set(key, timeout);
  }

  private async readEnvelope<T>(
    projectId: string,
    userId: string,
    kind: AutomationStudioUiCacheKind
  ): Promise<AutomationStudioUiCacheEnvelope<T> | undefined> {
    const value = await this.backend.get<AutomationStudioUiCacheEnvelope<T>>(
      automationStudioUiCacheKey(projectId, userId, kind)
    ).catch(() => undefined);
    return isEnvelope(value, projectId, userId, kind) ? value : undefined;
  }

  private async writeEnvelope<T>(projectId: string, userId: string, kind: AutomationStudioUiCacheKind, value: T): Promise<void> {
    await this.backend.set(automationStudioUiCacheKey(projectId, userId, kind), {
      schemaVersion: AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION,
      projectId,
      userId,
      kind,
      updatedAt: Date.now(),
      value
    } satisfies AutomationStudioUiCacheEnvelope<T>);
  }
}

function isEnvelope<T>(
  value: unknown,
  projectId: string,
  userId: string,
  kind: AutomationStudioUiCacheKind
): value is AutomationStudioUiCacheEnvelope<T> {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as AutomationStudioUiCacheEnvelope<T>).schemaVersion === AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION
    && (value as AutomationStudioUiCacheEnvelope<T>).projectId === projectId
    && (value as AutomationStudioUiCacheEnvelope<T>).userId === userId
    && (value as AutomationStudioUiCacheEnvelope<T>).kind === kind
    && typeof (value as AutomationStudioUiCacheEnvelope<T>).updatedAt === "number";
}

function scheduleBackground(task: () => void | Promise<void>): void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const idleWindow = window as Window & {
      requestIdleCallback(callback: IdleRequestCallback, options?: IdleRequestOptions): number;
    };
    idleWindow.requestIdleCallback(() => { void task(); }, { timeout: 1_500 });
    return;
  }
  setTimeout(() => { void task(); }, 0);
}