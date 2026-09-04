import { normalizeAutomationHierarchySidebarUiState, type AutomationHierarchySidebarUiState } from "../../hierarchy/ui-coordinator";
import {
  scheduleAutomationStudioBackgroundWork,
  type AutomationStudioBackgroundScheduler,
  type AutomationStudioInputPendingProbe
} from "../../sync/background-work";
import { normalizeAutomationWorkspacePrefs, type AutomationWorkspacePrefs } from "../layout";
import {
  AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION,
  automationStudioUiCacheKey,
  LocalStorageAutomationStudioUiCacheBackend
} from "./backends";
import type {
  AutomationStudioUiCacheBackend,
  AutomationStudioCachedWorkspaceSeed,
  AutomationStudioUiCacheEnvelope,
  AutomationStudioUiCacheKind,
  AutomationStudioUiCachePort
} from "./contracts";

type ScheduledHydration = {
  projectId: string;
  controller: AbortController;
  cancel(): void;
};

type PendingWrite = {
  projectId: string;
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout> | null;
  cancelBackground: (() => void) | null;
};

export type AutomationStudioUiCacheCoordinatorOptions = {
  scheduler?: AutomationStudioBackgroundScheduler;
  isInputPending?: AutomationStudioInputPendingProbe;
  maxPendingWrites?: number;
  onMetric?: (metric: AutomationStudioUiCacheMetric) => void;
};

export type AutomationStudioUiCacheMetric = {
  phase: "queued" | "coalesced" | "started" | "finished" | "cancelled" | "evicted";
  operation: "hydrate" | "write";
  projectId: string;
  cacheKey: string;
  pendingHydrations: number;
  pendingWrites: number;
};

export class AutomationStudioUiCacheCoordinator implements AutomationStudioUiCachePort {
  private readonly pendingWrites = new Map<string, PendingWrite>();
  private readonly pendingHydrations = new Map<string, ScheduledHydration>();
  private readonly projectGenerations = new Map<string, number>();

  constructor(
    private readonly backend: AutomationStudioUiCacheBackend = new LocalStorageAutomationStudioUiCacheBackend(),
    private readonly options: AutomationStudioUiCacheCoordinatorOptions = {}
  ) {}

  markProjectUiMutation(projectId: string): void {
    this.bumpProjectGeneration(projectId);
    this.cancelHydrations(projectId);
  }

  hydrateWorkspacePrefs(input: {
    projectId: string;
    userId: string;
    durablePrefs: AutomationWorkspacePrefs;
    onHydrate(prefs: AutomationWorkspacePrefs): void;
  }): void {
    const generation = this.projectGeneration(input.projectId);
    const cacheKey = automationStudioUiCacheKey(input.projectId, input.userId, "workspacePrefs");
    this.scheduleHydration(input.projectId, cacheKey, async (signal) => {
      const envelope = await this.readEnvelope<AutomationStudioCachedWorkspaceSeed | AutomationWorkspacePrefs>(
        input.projectId,
        input.userId,
        "workspacePrefs",
        signal
      );
      if (!envelope || signal.aborted || this.projectGeneration(input.projectId) !== generation) return;
      const durableUpdatedAt = Number((input.durablePrefs as unknown as Record<string, unknown>).updatedAt ?? 0);
      if (durableUpdatedAt && envelope.updatedAt < durableUpdatedAt) return;
      input.onHydrate(navigationSafeWorkspaceSeed(envelope.value, input.durablePrefs));
    });
  }

  hydrateSidebar(input: {
    projectId: string;
    userId: string;
    onHydrate(sidebar: AutomationHierarchySidebarUiState): void;
  }): void {
    const generation = this.projectGeneration(input.projectId);
    const cacheKey = automationStudioUiCacheKey(input.projectId, input.userId, "sidebar");
    this.scheduleHydration(input.projectId, cacheKey, async (signal) => {
      const envelope = await this.readEnvelope<AutomationHierarchySidebarUiState>(
        input.projectId,
        input.userId,
        "sidebar",
        signal
      );
      if (!envelope || signal.aborted || this.projectGeneration(input.projectId) !== generation) return;
      input.onHydrate(navigationSafeSidebarSeed(envelope.value));
    });
  }

  scheduleWorkspacePrefsWrite(input: {
    projectId: string;
    userId: string;
    prefs: AutomationWorkspacePrefs;
    delayMs?: number;
  }): void {
    this.markProjectUiMutation(input.projectId);
    const prefs = compactWorkspaceCacheSeed(input.prefs);
    const key = automationStudioUiCacheKey(input.projectId, input.userId, "workspacePrefs");
    this.scheduleWrite(input.projectId, key, input.delayMs ?? 500, (signal) =>
      this.writeEnvelope(input.projectId, input.userId, "workspacePrefs", prefs, signal)
    );
  }

  scheduleSidebarWrite(input: {
    projectId: string;
    userId: string;
    sidebar: AutomationHierarchySidebarUiState;
    delayMs?: number;
  }): void {
    this.markProjectUiMutation(input.projectId);
    const sidebar = normalizeAutomationHierarchySidebarUiState(input.sidebar);
    const key = automationStudioUiCacheKey(input.projectId, input.userId, "sidebar");
    this.scheduleWrite(input.projectId, key, input.delayMs ?? 300, (signal) =>
      this.writeEnvelope(input.projectId, input.userId, "sidebar", sidebar, signal)
    );
  }

  cancelProject(projectId: string): void {
    this.bumpProjectGeneration(projectId);
    this.cancelHydrations(projectId);
    for (const [key, pending] of this.pendingWrites) {
      if (pending.projectId !== projectId) continue;
      this.cancelWrite(key, pending);
    }
  }

  private scheduleHydration(
    projectId: string,
    cacheKey: string,
    task: (signal: AbortSignal) => Promise<void>
  ): void {
    const existing = this.pendingHydrations.get(cacheKey);
    if (existing) {
      this.cancelHydration(cacheKey, existing);
      this.emit({ phase: "coalesced", operation: "hydrate", projectId, cacheKey });
    }
    const controller = new AbortController();
    let cancelScheduled: () => void = () => undefined;
    const hydration: ScheduledHydration = {
      projectId,
      controller,
      cancel: () => cancelScheduled()
    };
    this.pendingHydrations.set(cacheKey, hydration);
    this.emit({ phase: "queued", operation: "hydrate", projectId, cacheKey });
    cancelScheduled = scheduleAutomationStudioBackgroundWork(
      async () => {
        try {
          if (!controller.signal.aborted) {
            this.emit({ phase: "started", operation: "hydrate", projectId, cacheKey });
            await task(controller.signal);
          }
        } finally {
          if (!controller.signal.aborted) {
            this.emit({ phase: "finished", operation: "hydrate", projectId, cacheKey });
          }
          this.removeHydration(cacheKey, hydration);
        }
      },
      {
        signal: controller.signal,
        timeoutMs: 1_500,
        priority: "cache",
        label: `cache:hydrate:${projectId}`,
        ...(this.options.scheduler ? { scheduler: this.options.scheduler } : {}),
        ...(this.options.isInputPending ? { isInputPending: this.options.isInputPending } : {})
      }
    );
  }

  private scheduleWrite(
    projectId: string,
    key: string,
    delayMs: number,
    task: (signal: AbortSignal) => Promise<void>
  ): void {
    const existing = this.pendingWrites.get(key);
    if (existing) {
      this.cancelWrite(key, existing);
      this.emit({ phase: "coalesced", operation: "write", projectId, cacheKey: key });
    }
    this.evictPendingWritesIfNeeded();
    const pending: PendingWrite = {
      projectId,
      controller: new AbortController(),
      timeout: null,
      cancelBackground: null
    };
    this.pendingWrites.set(key, pending);
    this.emit({ phase: "queued", operation: "write", projectId, cacheKey: key });
    pending.timeout = setTimeout(() => {
      pending.timeout = null;
      if (pending.controller.signal.aborted || this.pendingWrites.get(key) !== pending) return;
      pending.cancelBackground = scheduleAutomationStudioBackgroundWork(
        async () => {
          try {
            if (!pending.controller.signal.aborted) {
              this.emit({ phase: "started", operation: "write", projectId, cacheKey: key });
              await task(pending.controller.signal);
            }
          } finally {
            if (!pending.controller.signal.aborted) {
              this.emit({ phase: "finished", operation: "write", projectId, cacheKey: key });
            }
            if (this.pendingWrites.get(key) === pending) this.pendingWrites.delete(key);
          }
        },
        {
          signal: pending.controller.signal,
          timeoutMs: 1_500,
          priority: "cache",
          label: `cache:write:${projectId}`,
          ...(this.options.scheduler ? { scheduler: this.options.scheduler } : {}),
          ...(this.options.isInputPending ? { isInputPending: this.options.isInputPending } : {})
        }
      );
    }, Math.max(0, delayMs));
  }

  private cancelHydrations(projectId: string): void {
    for (const [key, hydration] of this.pendingHydrations) {
      if (hydration.projectId !== projectId) continue;
      this.cancelHydration(key, hydration);
    }
  }

  private cancelHydration(key: string, hydration: ScheduledHydration): void {
    hydration.controller.abort();
    hydration.cancel();
    if (this.pendingHydrations.get(key) === hydration) this.pendingHydrations.delete(key);
    this.emit({
      phase: "cancelled",
      operation: "hydrate",
      projectId: hydration.projectId,
      cacheKey: key
    });
  }

  private removeHydration(key: string, hydration: ScheduledHydration): void {
    if (this.pendingHydrations.get(key) === hydration) this.pendingHydrations.delete(key);
  }

  private cancelWrite(key: string, pending: PendingWrite): void {
    pending.controller.abort();
    if (pending.timeout !== null) clearTimeout(pending.timeout);
    pending.cancelBackground?.();
    if (this.pendingWrites.get(key) === pending) this.pendingWrites.delete(key);
    this.emit({
      phase: "cancelled",
      operation: "write",
      projectId: pending.projectId,
      cacheKey: key
    });
  }

  private evictPendingWritesIfNeeded(): void {
    const configured = this.options.maxPendingWrites ?? 32;
    const limit = Math.max(1, Math.min(128, Math.floor(configured)));
    while (this.pendingWrites.size >= limit) {
      const oldest = this.pendingWrites.entries().next().value as [string, PendingWrite] | undefined;
      if (!oldest) return;
      const [key, pending] = oldest;
      this.cancelWrite(key, pending);
      this.emit({
        phase: "evicted",
        operation: "write",
        projectId: pending.projectId,
        cacheKey: key
      });
    }
  }

  private emit(metric: Omit<AutomationStudioUiCacheMetric, "pendingHydrations" | "pendingWrites">): void {
    const detail: AutomationStudioUiCacheMetric = {
      ...metric,
      pendingHydrations: this.pendingHydrations.size,
      pendingWrites: this.pendingWrites.size
    };
    this.options.onMetric?.(detail);
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<AutomationStudioUiCacheMetric>(
      "automation-studio:ui-cache-metric",
      { detail }
    ));
  }

  private projectGeneration(projectId: string): number {
    return this.projectGenerations.get(projectId) ?? 0;
  }

  private bumpProjectGeneration(projectId: string): void {
    this.projectGenerations.set(projectId, this.projectGeneration(projectId) + 1);
  }

  private async readEnvelope<T>(
    projectId: string,
    userId: string,
    kind: AutomationStudioUiCacheKind,
    signal: AbortSignal
  ): Promise<AutomationStudioUiCacheEnvelope<T> | undefined> {
    const value = await this.backend.get<AutomationStudioUiCacheEnvelope<T>>(
      automationStudioUiCacheKey(projectId, userId, kind),
      { signal }
    ).catch(() => undefined);
    if (signal.aborted) return undefined;
    return isEnvelope(value, projectId, userId, kind) ? value : undefined;
  }

  private async writeEnvelope<T>(
    projectId: string,
    userId: string,
    kind: AutomationStudioUiCacheKind,
    value: T,
    signal: AbortSignal
  ): Promise<void> {
    if (signal.aborted) return;
    await this.backend.set(automationStudioUiCacheKey(projectId, userId, kind), {
      schemaVersion: AUTOMATION_STUDIO_UI_CACHE_SCHEMA_VERSION,
      projectId,
      userId,
      kind,
      updatedAt: Date.now(),
      value
    } satisfies AutomationStudioUiCacheEnvelope<T>, { signal });
  }
}

export function navigationSafeWorkspaceSeed(
  cachedPrefs: AutomationStudioCachedWorkspaceSeed | AutomationWorkspacePrefs,
  durablePrefs: AutomationWorkspacePrefs
): AutomationWorkspacePrefs {
  const durable = normalizeAutomationWorkspacePrefs(durablePrefs);
  const cached = normalizeAutomationWorkspacePrefs({
    ...durable,
    ...cachedPrefs,
    rightSidebar: {
      ...durable.rightSidebar,
      collapsed: "rightSidebarCollapsedState" in cachedPrefs
        ? cachedPrefs.rightSidebarCollapsedState
        : cachedPrefs.rightSidebar.collapsed
    },
    bottomDock: {
      ...durable.bottomDock,
      expanded: "bottomDockExpanded" in cachedPrefs
        ? cachedPrefs.bottomDockExpanded
        : cachedPrefs.bottomDock.expanded
    }
  });
  return {
    ...durable,
    activePaneId: cached.activePaneId,
    activeViewId: cached.activeViewId,
    panes: cached.panes,
    sidebarWidth: cached.sidebarWidth,
    leftSidebarCollapsed: cached.leftSidebarCollapsed,
    inspectorWidth: cached.inspectorWidth,
    bottomTimelineHeight: cached.bottomTimelineHeight,
    bottomTimelineCollapsed: cached.bottomTimelineCollapsed,
    mainLayoutPreset: cached.mainLayoutPreset,
    mainSplitRatios: cached.mainSplitRatios,
    rightSidebar: cached.rightSidebar,
    bottomDock: cached.bottomDock,
    viewStates: cached.viewStates,
    rightSidebarCollapsed: cached.rightSidebarCollapsed,
    density: cached.density,
    motion: cached.motion
  };
}

export function compactWorkspaceCacheSeed(
  prefs: AutomationWorkspacePrefs
): AutomationStudioCachedWorkspaceSeed {
  const normalized = normalizeAutomationWorkspacePrefs(prefs);
  return {
    activePaneId: normalized.activePaneId,
    activeViewId: normalized.activeViewId,
    panes: normalized.panes.map((pane) => ({ ...pane, tabs: [...pane.tabs] })),
    sidebarWidth: normalized.sidebarWidth,
    leftSidebarCollapsed: normalized.leftSidebarCollapsed,
    inspectorWidth: normalized.inspectorWidth,
    bottomTimelineHeight: normalized.bottomTimelineHeight,
    bottomTimelineCollapsed: normalized.bottomTimelineCollapsed,
    mainLayoutPreset: normalized.mainLayoutPreset,
    mainSplitRatios: [...normalized.mainSplitRatios],
    rightSidebarCollapsed: normalized.rightSidebarCollapsed,
    rightSidebar: { ...normalized.rightSidebar, tabs: [...normalized.rightSidebar.tabs] },
    bottomDock: { ...normalized.bottomDock },
    viewStates: normalized.viewStates,
    density: normalized.density,
    motion: normalized.motion,
    rightSidebarCollapsedState: normalized.rightSidebar.collapsed,
    bottomDockExpanded: normalized.bottomDock.expanded
  };
}

export function navigationSafeSidebarSeed(
  cachedSidebar: AutomationHierarchySidebarUiState
): AutomationHierarchySidebarUiState {
  const cached = normalizeAutomationHierarchySidebarUiState(cachedSidebar);
  return {
    ...cached,
    focusedTreeNodeId: "root-flow",
    primaryTreeNodeId: null
  };
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
