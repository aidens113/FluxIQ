import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../layout";
import {
  AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS,
  AUTOMATION_STUDIO_UI_CACHE_MAX_PROJECTS,
  AutomationStudioUiCacheCoordinator,
  LocalStorageAutomationStudioUiCacheBackend,
  ProgramApiAutomationStudioUiCacheBackend,
  automationStudioUiCacheKey,
  pruneAutomationStudioUiCache,
  type AutomationStudioUiCacheBackend
} from "./index";
import { normalizeAutomationHierarchySidebarUiState } from "../../hierarchy/ui-coordinator";

class MemoryUiCacheBackend implements AutomationStudioUiCacheBackend {
  readonly values = new Map<string, unknown>();
  writes: Array<{ key: string; value: unknown }> = [];
  signals: AbortSignal[] = [];

  async get<T>(key: string, options?: { signal?: AbortSignal }): Promise<T | undefined> {
    if (options?.signal) this.signals.push(options.signal);
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal) this.signals.push(options.signal);
    if (options?.signal?.aborted) return;
    this.values.set(key, value);
    this.writes.push({ key, value });
  }
}

async function flushAsyncTasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AutomationStudioUiCacheCoordinator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hydrates workspace prefs in the background without blocking first render", async () => {
    const backend = new MemoryUiCacheBackend();
    const coordinator = new AutomationStudioUiCacheCoordinator(backend);
    const durablePrefs = defaultAutomationWorkspacePrefs();
    const cachedPrefs = {
      ...durablePrefs,
      activeViewId: "runtime-debug",
      sidebarWidth: 333,
      panes: [{ id: "pane-main-1", activeViewId: "runtime-debug", tabs: ["flow-nodes", "runtime-debug"] }]
    };
    coordinator.scheduleWorkspacePrefsWrite({ projectId: "project-a", userId: "user-a", prefs: cachedPrefs, delayMs: 1 });
    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();

    const onHydrate = vi.fn();
    coordinator.hydrateWorkspacePrefs({ projectId: "project-a", userId: "user-a", durablePrefs, onHydrate });

    expect(onHydrate).not.toHaveBeenCalled();
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();
    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(onHydrate.mock.calls[0]?.[0].activeViewId).toBe(durablePrefs.activeViewId);
    expect(onHydrate.mock.calls[0]?.[0].panes).toEqual(durablePrefs.panes);
    expect(onHydrate.mock.calls[0]?.[0].sidebarWidth).toBe(333);
  });

  it("debounces workspace writes and stores only the latest compact non-navigation state", async () => {
    const backend = new MemoryUiCacheBackend();
    const coordinator = new AutomationStudioUiCacheCoordinator(backend);
    const first = { ...defaultAutomationWorkspacePrefs(), activeViewId: "flow-nodes", sidebarWidth: 280 };
    const latest = { ...defaultAutomationWorkspacePrefs(), activeViewId: "runtime-debug", sidebarWidth: 360, panes: [{ id: "pane-main-1", activeViewId: "runtime-debug", tabs: ["runtime-debug"] }] };

    coordinator.scheduleWorkspacePrefsWrite({ projectId: "project-a", userId: "user-a", prefs: first, delayMs: 50 });
    coordinator.scheduleWorkspacePrefsWrite({ projectId: "project-a", userId: "user-a", prefs: latest, delayMs: 50 });
    await vi.advanceTimersByTimeAsync(49);
    expect(backend.writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();

    expect(backend.writes).toHaveLength(1);
    expect((backend.writes[0]?.value as any).value.sidebarWidth).toBe(360);
    expect((backend.writes[0]?.value as any).value.activeViewId).toBeUndefined();
    expect((backend.writes[0]?.value as any).value.panes).toBeUndefined();
    expect((backend.writes[0]?.value as any).value.viewStates).toBeUndefined();
  });

  it("does not apply stale hydration after a local UI mutation", async () => {
    const backend = new MemoryUiCacheBackend();
    const coordinator = new AutomationStudioUiCacheCoordinator(backend);
    const durablePrefs = defaultAutomationWorkspacePrefs();
    const cachedPrefs = { ...durablePrefs, activeViewId: "runtime-debug", panes: [{ id: "pane-main-1", activeViewId: "runtime-debug", tabs: ["runtime-debug"] }] };
    coordinator.scheduleWorkspacePrefsWrite({ projectId: "project-a", userId: "user-a", prefs: cachedPrefs, delayMs: 1 });
    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();

    const onHydrate = vi.fn();
    coordinator.hydrateWorkspacePrefs({ projectId: "project-a", userId: "user-a", durablePrefs, onHydrate });
    coordinator.markProjectUiMutation("project-a");
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();

    expect(onHydrate).not.toHaveBeenCalled();
  });

  it("never restores cached hierarchy focus or primary selection", async () => {
    const backend = new MemoryUiCacheBackend();
    const coordinator = new AutomationStudioUiCacheCoordinator(backend);
    coordinator.scheduleSidebarWrite({
      projectId: "project-a",
      userId: "user-a",
      sidebar: {
        collapsedFolderIds: ["folder-a"],
        expandedDefaultCollapsedIds: [],
        focusedTreeNodeId: "flow-a:settings",
        primaryTreeNodeId: "flow-a:settings",
        search: "settings",
        typeFilter: "all"
      },
      delayMs: 1
    });
    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();

    const onHydrate = vi.fn();
    coordinator.hydrateSidebar({ projectId: "project-a", userId: "user-a", onHydrate });
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();

    expect(onHydrate).toHaveBeenCalledWith(expect.objectContaining({
      collapsedFolderIds: ["folder-a"],
      focusedTreeNodeId: "root-flow",
      primaryTreeNodeId: null
    }));
  });

  it("aborts queued cache work on project close without completing hydration or writes", async () => {
    const callbacks: Array<() => void> = [];
    const backend = new MemoryUiCacheBackend();
    const coordinator = new AutomationStudioUiCacheCoordinator(backend, {
      scheduler: (callback) => {
        callbacks.push(callback);
        return () => undefined;
      }
    });
    const onHydrate = vi.fn();
    coordinator.hydrateWorkspacePrefs({
      projectId: "project-a",
      userId: "user-a",
      durablePrefs: defaultAutomationWorkspacePrefs(),
      onHydrate
    });
    callbacks.shift()?.();
    coordinator.cancelProject("project-a");
    await flushAsyncTasks();

    expect(onHydrate).not.toHaveBeenCalled();
    expect(backend.signals).toHaveLength(1);
    expect(backend.signals[0]?.aborted).toBe(true);

    coordinator.scheduleWorkspacePrefsWrite({
      projectId: "project-a",
      userId: "user-a",
      prefs: defaultAutomationWorkspacePrefs(),
      delayMs: 1
    });
    await vi.advanceTimersByTimeAsync(1);

    coordinator.cancelProject("project-a");
    callbacks.splice(0).forEach((callback) => callback());
    await flushAsyncTasks();

    expect(backend.writes).toHaveLength(0);
    expect(backend.signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("keeps cache work queued while browser input is pending", async () => {
    const callbacks: Array<() => void> = [];
    let inputPending = true;
    const backend = new MemoryUiCacheBackend();
    const coordinator = new AutomationStudioUiCacheCoordinator(backend, {
      scheduler: (callback) => {
        callbacks.push(callback);
        return () => undefined;
      },
      isInputPending: () => inputPending
    });
    coordinator.hydrateWorkspacePrefs({
      projectId: "project-a",
      userId: "user-a",
      durablePrefs: defaultAutomationWorkspacePrefs(),
      onHydrate: vi.fn()
    });

    callbacks.shift()?.();
    await flushAsyncTasks();
    expect(backend.signals).toHaveLength(0);

    inputPending = false;
    callbacks.shift()?.();
    await flushAsyncTasks();
    expect(backend.signals).toHaveLength(1);
  });

  it("coalesces equivalent hydration work and only applies the latest callback", async () => {
    const callbacks: Array<() => void> = [];
    const backend = new MemoryUiCacheBackend();
    const durablePrefs = defaultAutomationWorkspacePrefs();
    backend.values.set(
      automationStudioUiCacheKey("project-a", "user-a", "workspacePrefs"),
      {
        schemaVersion: 1,
        projectId: "project-a",
        userId: "user-a",
        kind: "workspacePrefs",
        updatedAt: Date.now(),
        value: { ...durablePrefs, sidebarWidth: 345 }
      }
    );
    const coordinator = new AutomationStudioUiCacheCoordinator(backend, {
      scheduler: (callback) => {
        callbacks.push(callback);
        return () => undefined;
      }
    });
    const firstHydrate = vi.fn();
    const latestHydrate = vi.fn();

    coordinator.hydrateWorkspacePrefs({
      projectId: "project-a",
      userId: "user-a",
      durablePrefs,
      onHydrate: firstHydrate
    });
    coordinator.hydrateWorkspacePrefs({
      projectId: "project-a",
      userId: "user-a",
      durablePrefs,
      onHydrate: latestHydrate
    });
    callbacks.splice(0).forEach((callback) => callback());
    await flushAsyncTasks();

    expect(firstHydrate).not.toHaveBeenCalled();
    expect(latestHydrate).toHaveBeenCalledTimes(1);
    expect(latestHydrate.mock.calls[0]?.[0].sidebarWidth).toBe(345);
    expect(backend.signals).toHaveLength(1);
  });

  it("bounds pending writes and reports queue diagnostics without subscribers", () => {
    const metrics: Array<{ phase: string; pendingWrites: number }> = [];
    const coordinator = new AutomationStudioUiCacheCoordinator(new MemoryUiCacheBackend(), {
      maxPendingWrites: 2,
      onMetric: (metric) => metrics.push(metric)
    });

    for (const userId of ["user-a", "user-b", "user-c"]) {
      coordinator.scheduleWorkspacePrefsWrite({
        projectId: "project-a",
        userId,
        prefs: defaultAutomationWorkspacePrefs(),
        delayMs: 1_000
      });
    }

    expect(metrics.some((metric) => metric.phase === "evicted")).toBe(true);
    expect(Math.max(...metrics.map((metric) => metric.pendingWrites))).toBeLessThanOrEqual(2);
    coordinator.cancelProject("project-a");
  });


  it("writes through the Program API backend while keeping local fallback first", async () => {
    const api = { post: vi.fn(async (endpoint: string, payload: Record<string, unknown>) => ({ ok: true, payload: endpoint === "get-project-ui-cache" ? { entries: [] } : { entries: [] } })) } as any;
    const fallback = new MemoryUiCacheBackend();
    const backend = new ProgramApiAutomationStudioUiCacheBackend(api, fallback);
    const envelope = { schemaVersion: 1, projectId: "project-a", userId: "user-a", kind: "sidebar", updatedAt: 123, value: { search: "router" } };
    const key = "fluxiq%3Aautomation-studio%3Aui-cache:user-a:project-a:sidebar";

    await backend.set(key, envelope);
    expect(fallback.values.get(key)).toEqual(envelope);
    expect(api.post).toHaveBeenCalledWith(
      "save-project-ui-cache",
      { projectId: "project-a", entries: [{ cacheKey: "sidebar", value: envelope }] },
      undefined
    );
    await expect(backend.get(key)).resolves.toEqual(envelope);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it("bounds localStorage fallback cache parse and write size", async () => {
    const originalWindow = globalThis.window;
    const values = new Map<string, string>();
    const fakeWindow = {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); }
      }
    } as any;
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    try {
      const backend = new LocalStorageAutomationStudioUiCacheBackend();
      values.set("oversized", "{" + " ".repeat(AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS) + "}");
      await expect(backend.get("oversized")).resolves.toBeUndefined();
      expect(values.has("oversized")).toBe(false);

      await backend.set("too-large", { payload: "x".repeat(AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS) });
      expect(values.has("too-large")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });
  it("prunes browser cache to explicit project and global ownership limits", () => {
    const values = new Map<string, string>();
    const storage = {
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
    } as Storage;
    for (let index = 0; index < AUTOMATION_STUDIO_UI_CACHE_MAX_PROJECTS + 3; index += 1) {
      values.set(automationStudioUiCacheKey(`project-${index}`, "user", "sidebar"), JSON.stringify({ updatedAt: index, value: { search: "" } }));
    }
    pruneAutomationStudioUiCache(storage);
    expect(new Set([...values.keys()].map((key) => key.split(":")[2])).size).toBe(AUTOMATION_STUDIO_UI_CACHE_MAX_PROJECTS);
    expect([...values.keys()].some((key) => key.includes("project-0"))).toBe(false);
  });
  it("normalizes sidebar cache state with bounded lists and safe filter defaults", () => {
    const sidebar = normalizeAutomationHierarchySidebarUiState({
      collapsedFolderIds: Array.from({ length: 550 }, (_, index) => `folder-${index}`),
      expandedDefaultCollapsedIds: ["subflow-a", "", "subflow-b"],
      focusedTreeNodeId: "flow-a",
      primaryTreeNodeId: "flow-a:router",
      search: "x".repeat(300),
      typeFilter: "not-real" as any
    });

    expect(sidebar.collapsedFolderIds).toHaveLength(500);
    expect(sidebar.expandedDefaultCollapsedIds).toEqual(["subflow-a", "subflow-b"]);
    expect(sidebar.search).toHaveLength(240);
    expect(sidebar.typeFilter).toBe("all");
  });
});
