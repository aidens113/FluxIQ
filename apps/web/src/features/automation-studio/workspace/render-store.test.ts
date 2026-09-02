import { describe, expect, it, vi } from "vitest";
import { defaultAutomationWorkspacePrefs } from "./layout/defaults";
import { createAutomationWorkspaceRenderStore, shallowAutomationWorkspaceRenderInputsSame } from "./render-store";

describe("Automation workspace render store", () => {
  it("publishes workspace-only changes without mutating its previous snapshot", () => {
    const initial = defaultAutomationWorkspacePrefs();
    const store = createAutomationWorkspaceRenderStore(initial);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const previous = store.getPrefs();
    const next = { ...previous, activeViewId: "runtime-debug" };

    store.replace(next);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getRevision()).toBe(1);
    expect(store.getPrefs()).not.toBe(previous);
    expect(previous.activeViewId).not.toBe("runtime-debug");
    expect(store.getPrefs().activeViewId).toBe("runtime-debug");

    unsubscribe();
    store.replace({ ...store.getPrefs(), activeViewId: "flow-settings" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("never mutates a previously published preference snapshot", () => {
    const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const previous = store.getPrefs();
    const previousWidth = previous.sidebarWidth;
    expect(store.replace({ ...previous, sidebarWidth: previousWidth + 40 })).toBe(true);
    expect(previous.sidebarWidth).toBe(previousWidth);
    expect(store.getPrefs()).not.toBe(previous);
    expect(store.getPrefs().sidebarWidth).toBe(previousWidth + 40);
  });

  it("does not publish a no-op replacement of its current snapshot", () => {
    const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.replace(store.getPrefs())).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rerenders only when a declared render input changes", () => {
    const stableObject = {};
    expect(shallowAutomationWorkspaceRenderInputsSame(["project", stableObject, 1], ["project", stableObject, 1])).toBe(true);
    expect(shallowAutomationWorkspaceRenderInputsSame(["project", stableObject, 1], ["project", {}, 1])).toBe(false);
    expect(shallowAutomationWorkspaceRenderInputsSame(["project"], ["project", 1])).toBe(false);
  });
});
