import { describe, expect, it, vi } from "vitest";
import { defaultAutomationWorkspacePrefs } from "./layout";
import { createAutomationWorkspaceRenderStore, shallowAutomationWorkspaceRenderInputsSame } from "./render-store";

describe("AutomationWorkspaceRenderStore", () => {
  it("publishes workspace-only changes without replacing the root-owned object", () => {
    const initial = defaultAutomationWorkspacePrefs();
    const store = createAutomationWorkspaceRenderStore(initial);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const next = {
      ...initial,
      activeViewId: "runtime-debug",
      panes: initial.panes.map((pane, index) => index === 0
        ? { ...pane, activeViewId: "runtime-debug", tabs: [...pane.tabs, "runtime-debug"] }
        : pane)
    };

    store.replace(next);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getRevision()).toBe(1);
    expect(store.getPrefs()).toBe(initial);
    expect(store.getPrefs().activeViewId).toBe("runtime-debug");
    expect(store.getPrefs().panes[0]?.activeViewId).toBe("runtime-debug");

    unsubscribe();
    store.replace({ ...store.getPrefs(), activeViewId: "flow-settings" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getRevision()).toBe(2);
  });

  it("rerenders parent commits only when a declared input changes", () => {
    const stableObject = {};

    expect(shallowAutomationWorkspaceRenderInputsSame(["project", stableObject, 1], ["project", stableObject, 1])).toBe(true);
    expect(shallowAutomationWorkspaceRenderInputsSame(["project", stableObject, 1], ["project", {}, 1])).toBe(false);
    expect(shallowAutomationWorkspaceRenderInputsSame(["project"], ["project", 1])).toBe(false);
  });
  it("does not publish a no-op replacement of its current snapshot", () => {
    const initial = defaultAutomationWorkspacePrefs();
    const store = createAutomationWorkspaceRenderStore(initial);
    const listener = vi.fn();
    store.subscribe(listener);

    store.replace(initial);

    expect(listener).not.toHaveBeenCalled();
    expect(store.getRevision()).toBe(0);
  });
});
