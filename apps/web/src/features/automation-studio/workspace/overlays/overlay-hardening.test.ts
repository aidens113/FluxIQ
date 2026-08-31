import { describe, expect, it, vi } from "vitest";
import { immutableOverlayCommandSnapshot } from "./atomic-command";
import { calculateFloatingPosition } from "./accessible-floating-overlay";
import { boundedHierarchyFolderOptions } from "./HierarchyCreateOverlaySurface";
import {
  acquireOverlayEnvironment,
  canCloseFloatingOverlay,
  overlayEnvironmentDepth
} from "./overlay-environment";
import {
  automationStudioOverlayRootAdoptionMap,
  automationStudioOverlayRootAdoptionSteps,
  createAutomationStudioOverlayController
} from "./root-adoption";
import { createAutomationStudioOverlayStore } from "./overlay-state-store";

describe("Phase 9 overlay hardening", () => {
  it("closes only the request that initiated an asynchronous command", () => {
    const store = createAutomationStudioOverlayStore();
    const controller = createAutomationStudioOverlayController(store);
    controller.preferences.open({
      id: "old",
      prefs: {} as never,
      saveStatus: "idle"
    });
    controller.preferences.open({
      id: "new",
      prefs: {} as never,
      saveStatus: "idle"
    });

    expect(controller.preferences.close("old")).toBe(false);
    expect(controller.preferences.current()?.id).toBe("new");
    expect(controller.preferences.close("new")).toBe(true);
    expect(controller.preferences.current()).toBeNull();
  });

  it("resets only active channels and publishes each one once", () => {
    const store = createAutomationStudioOverlayStore();
    const controller = createAutomationStudioOverlayController(store);
    const projectListener = vi.fn();
    const drawerListener = vi.fn();
    store.subscribe("project", projectListener);
    store.subscribe("drawer", drawerListener);
    controller.project.open({ id: "create", kind: "create-project", categoryId: null });
    controller.drawer.open({ id: "mobile", kind: "hierarchy", title: "Project" });
    projectListener.mockClear();
    drawerListener.mockClear();

    expect(controller.closeAll()).toEqual(["project", "drawer"]);
    expect(projectListener).toHaveBeenCalledTimes(1);
    expect(drawerListener).toHaveBeenCalledTimes(1);
  });

  it("deeply snapshots mutable command payloads", () => {
    const command = {
      type: "workspace.preferences.replace",
      prefs: { panes: [{ tabs: ["flow"] }] }
    };
    const snapshot = immutableOverlayCommandSnapshot(command);
    command.prefs.panes[0]!.tabs[0] = "settings";

    expect(snapshot).toEqual({
      type: "workspace.preferences.replace",
      prefs: { panes: [{ tabs: ["flow"] }] }
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.prefs)).toBe(true);
    expect(Object.isFrozen(snapshot.prefs.panes[0]!.tabs)).toBe(true);
  });

  it("keeps scroll locked until the final overlapping overlay releases", () => {
    const focus = vi.fn();
    const documentRef = {
      body: { style: { overflow: "auto" } }
    } as unknown as Document;
    const releaseFirst = acquireOverlayEnvironment(documentRef, { focus, isConnected: true });
    const releaseSecond = acquireOverlayEnvironment(documentRef, null);

    expect(documentRef.body.style.overflow).toBe("hidden");
    expect(overlayEnvironmentDepth(documentRef)).toBe(2);
    releaseFirst();
    expect(documentRef.body.style.overflow).toBe("hidden");
    expect(focus).not.toHaveBeenCalled();
    releaseSecond();
    expect(documentRef.body.style.overflow).toBe("auto");
    expect(focus).not.toHaveBeenCalled();
  });

  it("restores focus to the underlying overlay without unlocking scroll", () => {
    const originalFocus = vi.fn();
    const underlyingFocus = vi.fn();
    const documentRef = {
      body: { style: { overflow: "auto" } }
    } as unknown as Document;
    const releaseUnderlying = acquireOverlayEnvironment(documentRef, {
      focus: originalFocus,
      isConnected: true
    });
    const releaseTop = acquireOverlayEnvironment(documentRef, {
      focus: underlyingFocus,
      isConnected: true
    });

    releaseTop();
    expect(underlyingFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(documentRef.body.style.overflow).toBe("hidden");
    releaseUnderlying();
    expect(originalFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(documentRef.body.style.overflow).toBe("auto");
  });
  it("restores focus after the final overlay and ignores disconnected targets", () => {
    const focus = vi.fn();
    const documentRef = {
      body: { style: { overflow: "" } }
    } as unknown as Document;

    acquireOverlayEnvironment(documentRef, { focus, isConnected: true })();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });

    acquireOverlayEnvironment(documentRef, { focus, isConnected: false })();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("does not mutate document scrolling for floating menu overlays", () => {
    const documentRef = {
      body: { style: { overflow: "auto" } }
    } as unknown as Document;

    const release = acquireOverlayEnvironment(documentRef, null, { lockScroll: false });
    expect(documentRef.body.style.overflow).toBe("auto");
    expect(overlayEnvironmentDepth(documentRef)).toBe(1);
    release();
    expect(documentRef.body.style.overflow).toBe("auto");
  });

  it("blocks implicit dismissal during a command but permits explicit cancellation", () => {
    expect(canCloseFloatingOverlay(true, "escape")).toBe(false);
    expect(canCloseFloatingOverlay(true, "backdrop")).toBe(false);
    expect(canCloseFloatingOverlay(true, "explicit")).toBe(true);
    expect(canCloseFloatingOverlay(false, "escape")).toBe(true);
  });

  it("contains floating overlays within narrow and short viewports", () => {
    const narrow = calculateFloatingPosition(
      { top: 40, right: 300, bottom: 60, left: 280 },
      420,
      600,
      320,
      480
    );
    expect(narrow.width).toBe(296);
    expect(narrow.left).toBe(12);
    expect(narrow.top).toBe(12);
    expect(narrow.maxHeight).toBe(456);

    const below = calculateFloatingPosition(
      { top: 20, right: 120, bottom: 40, left: 20 },
      240,
      100,
      800,
      600
    );
    expect(below.top).toBe(48);
  });

  it("bounds hierarchy folder results and retains the selected location", () => {
    const options = Array.from({ length: 500 }, (_, index) => ({
      id: `folder-${index}`,
      label: `Folder ${index}`
    }));
    const source = {
      resolve: (id: string) => options.find((option) => option.id === id) ?? null,
      search: () => options
    };

    const result = boundedHierarchyFolderOptions(source, "", "folder-499");
    expect(result).toHaveLength(100);
    expect(result[0]?.id).toBe("folder-499");
    expect(result.filter((option) => option.id === "folder-499")).toHaveLength(1);
  });
  it("defines one exact adoption entry for every store channel", () => {
    expect(Object.keys(automationStudioOverlayRootAdoptionMap).sort()).toEqual([
      "dataInspector",
      "drawer",
      "hierarchy",
      "inspectorDrawer",
      "layoutPicker",
      "preferences",
      "project",
      "viewAdder"
    ]);
    for (const [key, entry] of Object.entries(automationStudioOverlayRootAdoptionMap)) {
      expect(entry.storeKey).toBe(key);
      expect(entry.legacyOwner.length).toBeGreaterThan(10);
      expect(entry.subscriber.length).toBeGreaterThan(5);
    }
    expect(automationStudioOverlayRootAdoptionSteps).toHaveLength(7);
  });
});
