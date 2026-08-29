import { describe, expect, it, vi } from "vitest";
import { createAutomationMountedViewActivationStore } from "./mounted-view-activation";

describe("mounted view activation store", () => {
  it("publishes an immediate view and active-window transition only to mounted windows", () => {
    const store = createAutomationMountedViewActivationStore();
    const releaseFirst = store.registerWindow("pane-1", ["nodes", "settings"]);
    const releaseSecond = store.registerWindow("pane-2", ["runtime"]);
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribeFirst = store.subscribe("pane-1", firstListener);
    const unsubscribeSecond = store.subscribe("pane-2", secondListener);

    expect(store.activate("pane-1", "missing")).toBe(false);
    expect(store.activate("missing-pane", "nodes")).toBe(false);
    expect(store.activate("pane-2", "runtime")).toBe(true);
    expect(store.getSnapshot("pane-2")).toEqual({
      activeViewId: "runtime",
      activeWindow: true
    });
    expect(store.getSnapshot("pane-1")).toEqual({
      activeViewId: null,
      activeWindow: false
    });
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    unsubscribeSecond();
    releaseFirst();
    releaseSecond();
  });

  it("clears optimistic state only when store-backed state confirms it", () => {
    const store = createAutomationMountedViewActivationStore();
    const release = store.registerWindow("pane-1", ["nodes", "settings"]);
    store.activate("pane-1", "settings");

    store.confirm("pane-1", "nodes", false);
    expect(store.getSnapshot("pane-1").activeViewId).toBe("settings");

    store.confirm("pane-1", "settings", true);
    expect(store.getSnapshot("pane-1")).toEqual({
      activeViewId: null,
      activeWindow: null
    });
    release();
  });

  it("isolates workspace lifetimes and releases unmounted window keys", () => {
    const firstProject = createAutomationMountedViewActivationStore();
    const secondProject = createAutomationMountedViewActivationStore();
    const release = firstProject.registerWindow("pane-1", ["nodes"]);

    firstProject.activate("pane-1", "nodes");
    expect(secondProject.getSnapshot("pane-1")).toEqual({
      activeViewId: null,
      activeWindow: null
    });

    release();
    expect(firstProject.getSnapshot("pane-1")).toEqual({
      activeViewId: null,
      activeWindow: null
    });
    expect(firstProject.activate("pane-1", "nodes")).toBe(false);
  });

  it("keeps right-sidebar activation from changing main-window activity", () => {
    const store = createAutomationMountedViewActivationStore();
    const releaseMain = store.registerWindow("pane-1", ["nodes"]);
    const releaseRight = store.registerWindow("right-sidebar", ["inspector"]);

    expect(store.activate("right-sidebar", "inspector")).toBe(true);
    expect(store.getSnapshot("right-sidebar")).toEqual({
      activeViewId: "inspector",
      activeWindow: null
    });
    expect(store.getSnapshot("pane-1").activeWindow).toBeNull();

    releaseMain();
    releaseRight();
  });
});