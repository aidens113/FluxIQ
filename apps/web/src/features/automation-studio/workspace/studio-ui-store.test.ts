import { describe, expect, it, vi } from "vitest";
import { createAutomationStudioUiStore, shallowStudioUiRenderInputsSame } from "./studio-ui-store";

describe("AutomationStudioUiStore", () => {
  it("publishes Studio-UI-only updates without involving workspace data", () => {
    const store = createAutomationStudioUiStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.patch({ preferencesOpen: true });
    store.patch({ hierarchyName: "New flow", hierarchyPin: "1234" });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getRevision()).toBe(2);
    expect(store.getState()).toMatchObject({
      preferencesOpen: true,
      hierarchyName: "New flow",
      hierarchyPin: "1234"
    });
  });

  it("publishes one revision for an atomic hierarchy action update", () => {
    const store = createAutomationStudioUiStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.patch({
      hierarchyAction: { action: "create", category: "flow", parentId: null },
      hierarchyCreateStep: "type",
      hierarchyKind: "flow",
      hierarchyName: "",
      hierarchyPin: "",
      hierarchyStatus: ""
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getRevision()).toBe(1);
  });

  it("does not publish shallow no-op patches", () => {
    const store = createAutomationStudioUiStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.patch({ preferencesOpen: false });
    store.update((current) => current);

    expect(listener).not.toHaveBeenCalled();
    expect(store.getRevision()).toBe(0);
  });

  it("publishes responsive panel changes on the narrow-workspace scope", () => {
    const store = createAutomationStudioUiStore();
    const listener = vi.fn();
    store.subscribe(listener, "narrow-workspace");

    expect(store.patch({ narrowWorkspacePanel: "hierarchy" })).toBe(true);

    expect(listener).toHaveBeenCalledOnce();
    expect(store.getRevision("narrow-workspace")).toBe(1);
    expect(store.getState().narrowWorkspacePanel).toBe("hierarchy");
  });

  it("shallowly gates parent-provided render inputs", () => {
    const stable = {};
    expect(shallowStudioUiRenderInputsSame(["project", stable], ["project", stable])).toBe(true);
    expect(shallowStudioUiRenderInputsSame(["project", stable], ["project", {}])).toBe(false);
  });
});
