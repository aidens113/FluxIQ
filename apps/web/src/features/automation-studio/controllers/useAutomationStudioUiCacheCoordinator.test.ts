import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import {
  AUTOMATION_STUDIO_UI_CACHE_MAX_LOCAL_STORAGE_CHARS,
  AutomationStudioUiCacheCoordinator,
  LocalStorageAutomationStudioUiCacheBackend,
  ProgramApiAutomationStudioUiCacheBackend,
  normalizeAutomationStudioSidebarUiState,
  type AutomationStudioUiCacheBackend
} from "./useAutomationStudioUiCacheCoordinator";

class MemoryUiCacheBackend implements AutomationStudioUiCacheBackend {
  readonly values = new Map<string, unknown>();
  writes: Array<{ key: string; value: unknown }> = [];

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
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
    const cachedPrefs = { ...durablePrefs, activeViewId: "runtime-debug", panes: [{ id: "pane-main-1", activeViewId: "runtime-debug", tabs: ["policy-primary", "runtime-debug"] }] };
    coordinator.scheduleWorkspacePrefsWrite({ projectId: "project-a", userId: "user-a", prefs: cachedPrefs, delayMs: 1 });
    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();

    const onHydrate = vi.fn();
    coordinator.hydrateWorkspacePrefs({ projectId: "project-a", userId: "user-a", durablePrefs, onHydrate });

    expect(onHydrate).not.toHaveBeenCalled();
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();
    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(onHydrate.mock.calls[0]?.[0].activeViewId).toBe("runtime-debug");
  });

  it("debounces workspace writes and stores only the latest exact UI state", async () => {
    const backend = new MemoryUiCacheBackend();
    const coordinator = new AutomationStudioUiCacheCoordinator(backend);
    const first = { ...defaultAutomationWorkspacePrefs(), activeViewId: "policy-primary" };
    const latest = { ...defaultAutomationWorkspacePrefs(), activeViewId: "runtime-debug", panes: [{ id: "pane-main-1", activeViewId: "runtime-debug", tabs: ["runtime-debug"] }] };

    coordinator.scheduleWorkspacePrefsWrite({ projectId: "project-a", userId: "user-a", prefs: first, delayMs: 50 });
    coordinator.scheduleWorkspacePrefsWrite({ projectId: "project-a", userId: "user-a", prefs: latest, delayMs: 50 });
    await vi.advanceTimersByTimeAsync(49);
    expect(backend.writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();
    await flushAsyncTasks();

    expect(backend.writes).toHaveLength(1);
    expect((backend.writes[0]?.value as any).value.activeViewId).toBe("runtime-debug");
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


  it("writes through the Program API backend while keeping local fallback first", async () => {
    const api = { post: vi.fn(async (endpoint: string, payload: Record<string, unknown>) => ({ ok: true, payload: endpoint === "get-project-ui-cache" ? { entries: [] } : { entries: [] } })) } as any;
    const fallback = new MemoryUiCacheBackend();
    const backend = new ProgramApiAutomationStudioUiCacheBackend(api, fallback);
    const envelope = { schemaVersion: 1, projectId: "project-a", userId: "user-a", kind: "sidebar", updatedAt: 123, value: { search: "router" } };
    const key = "fluxiq%3Aautomation-studio%3Aui-cache:user-a:project-a:sidebar";

    await backend.set(key, envelope);
    expect(fallback.values.get(key)).toEqual(envelope);
    expect(api.post).toHaveBeenCalledWith("save-project-ui-cache", { projectId: "project-a", entries: [{ cacheKey: "sidebar", value: envelope }] });
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
  it("normalizes sidebar cache state with bounded lists and safe filter defaults", () => {
    const sidebar = normalizeAutomationStudioSidebarUiState({
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
