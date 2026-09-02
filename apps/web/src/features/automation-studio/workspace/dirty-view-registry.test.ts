import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dirtyViewRegistrySnapshot,
  registerDirtyView,
  requestDirtyViewDecision,
  resetDirtyViewRegistryForTests,
  resolveDirtyViewDecision
} from "./dirty-view-registry";

afterEach(resetDirtyViewRegistryForTests);

describe("Automation Studio dirty-view decisions", () => {
  it("defers an affected close until the user discards", async () => {
    const proceed = vi.fn();
    const discard = vi.fn();
    registerDirtyView({ id: "settings:one", viewId: "flow-settings", label: "Flow Settings", dirty: true, save: vi.fn(), discard });
    expect(requestDirtyViewDecision({ actionLabel: "closing the tab", viewIds: ["flow-settings"], proceed })).toBe(false);
    expect(proceed).not.toHaveBeenCalled();
    expect(dirtyViewRegistrySnapshot().pending?.entries.map((entry) => entry.label)).toEqual(["Flow Settings"]);
    await resolveDirtyViewDecision("discard");
    expect(discard).toHaveBeenCalledOnce();
    expect(proceed).toHaveBeenCalledOnce();
  });

  it("opens the existing save flow without closing and supports cancel", async () => {
    const proceed = vi.fn();
    const save = vi.fn();
    registerDirtyView({ id: "graph:one", viewId: "flow-nodes", label: "Node graph", dirty: true, save, discard: vi.fn() });
    requestDirtyViewDecision({ actionLabel: "changing selection", proceed });
    await resolveDirtyViewDecision("save");
    expect(save).toHaveBeenCalledOnce();
    expect(proceed).not.toHaveBeenCalled();
    requestDirtyViewDecision({ actionLabel: "changing selection", proceed });
    await resolveDirtyViewDecision("cancel");
    expect(proceed).not.toHaveBeenCalled();
  });

  it("allows unrelated and clean views immediately", () => {
    const proceed = vi.fn();
    registerDirtyView({ id: "clean", viewId: "flow-settings", label: "Settings", dirty: false, save: vi.fn(), discard: vi.fn() });
    expect(requestDirtyViewDecision({ actionLabel: "closing runtime", viewIds: ["runtime-debug"], proceed })).toBe(true);
    expect(proceed).toHaveBeenCalledOnce();
  });
});
