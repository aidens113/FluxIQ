import { describe, expect, it, vi } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import {
  createAutomationStudioLiveOverlayComposition,
  type AutomationStudioLiveOverlayBindings
} from "./useAutomationStudioLiveOverlays";

function createBindings(overrides: Partial<AutomationStudioLiveOverlayBindings> = {}) {
  return {
    activeProjectId: "project-a",
    addView: vi.fn(),
    arrangeLayout: vi.fn(),
    getPreferences: () => defaultAutomationWorkspacePrefs(),
    getPreferencesSaveStatus: () => "Saved",
    getViewAdderOptions: () => [],
    replacePreferences: vi.fn(),
    ...overrides
  } satisfies AutomationStudioLiveOverlayBindings;
}

describe("Automation Studio live overlay composition", () => {
  it("publishes open and close changes only to the selected channel", () => {
    const composition = createAutomationStudioLiveOverlayComposition(createBindings());
    const preferencesChanged = vi.fn();
    const viewAdderChanged = vi.fn();
    composition.store.subscribe("preferences", preferencesChanged);
    composition.store.subscribe("viewAdder", viewAdderChanged);

    composition.openPreferences();
    expect(preferencesChanged).toHaveBeenCalledTimes(1);
    expect(viewAdderChanged).not.toHaveBeenCalled();

    const id = composition.controller.preferences.current()!.id;
    expect(composition.controller.preferences.close(id)).toBe(true);
    expect(preferencesChanged).toHaveBeenCalledTimes(2);
    expect(viewAdderChanged).not.toHaveBeenCalled();
  });

  it("captures current snapshots and creates unique request IDs", () => {
    let saveStatus = "Saving";
    const composition = createAutomationStudioLiveOverlayComposition(createBindings({
      getPreferencesSaveStatus: () => saveStatus
    }));

    composition.openPreferences();
    const first = composition.controller.preferences.current()!;
    saveStatus = "Saved";
    composition.openPreferences();
    const second = composition.controller.preferences.current()!;

    expect(first.saveStatus).toBe("Saving");
    expect(second.saveStatus).toBe("Saved");
    expect(second.id).not.toBe(first.id);
    expect(second.id).toContain("project-a:preferences:");
  });

  it("routes typed commands through their current request and rejects stale work", async () => {
    const replacePreferences = vi.fn();
    const addView = vi.fn();
    const arrangeLayout = vi.fn();
    const composition = createAutomationStudioLiveOverlayComposition(createBindings({
      replacePreferences,
      addView,
      arrangeLayout
    }));

    composition.openPreferences();
    const stalePreferences = composition.controller.preferences.current()!;
    composition.openPreferences();
    const preferences = composition.controller.preferences.current()!;
    await expect(composition.dispatchers.preferences!({
      type: "workspace.preferences.replace",
      requestId: stalePreferences.id,
      prefs: stalePreferences.prefs
    })).rejects.toThrow("no longer active");
    await composition.dispatchers.preferences!({
      type: "workspace.preferences.replace",
      requestId: preferences.id,
      prefs: preferences.prefs
    });

    composition.openViewAdder("main", "pane-main", { top: 1, right: 2, bottom: 3, left: 4 });
    const viewAdder = composition.controller.viewAdder.current()!;
    await composition.dispatchers.view!({
      type: "workspace.view.add",
      requestId: viewAdder.id,
      viewId: "flow-router",
      area: "main",
      targetWindowId: "pane-main"
    });

    composition.openLayoutPicker("main", { top: 1, right: 2, bottom: 3, left: 4 });
    const layout = composition.controller.layoutPicker.current()!;
    await composition.dispatchers.layout!({
      type: "workspace.layout.arrange",
      requestId: layout.id,
      area: "main",
      preset: "single"
    });

    expect(replacePreferences).toHaveBeenCalledTimes(1);
    expect(addView).toHaveBeenCalledTimes(1);
    expect(arrangeLayout).toHaveBeenCalledTimes(1);
  });

  it("closes project-scoped channels exactly once on project change", () => {
    const composition = createAutomationStudioLiveOverlayComposition(createBindings());
    const preferencesChanged = vi.fn();
    const inspectorChanged = vi.fn();
    composition.store.subscribe("preferences", preferencesChanged);
    composition.store.subscribe("dataInspector", inspectorChanged);
    composition.openPreferences();
    composition.openDataInspector();
    preferencesChanged.mockClear();
    inspectorChanged.mockClear();

    expect(composition.resetProject("project-a")).toEqual([]);
    expect(preferencesChanged).not.toHaveBeenCalled();
    expect(composition.resetProject("project-b")).toEqual(["preferences", "dataInspector"]);
    expect(preferencesChanged).toHaveBeenCalledTimes(1);
    expect(inspectorChanged).toHaveBeenCalledTimes(1);
    expect(composition.controller.preferences.current()).toBeNull();
    expect(composition.controller.dataInspector.current()).toBeNull();
  });
});