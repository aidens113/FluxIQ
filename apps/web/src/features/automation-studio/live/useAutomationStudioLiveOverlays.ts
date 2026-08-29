"use client";

import { useEffect, useMemo } from "react";
import type { AutomationViewAdderOption } from "../workspace/view-adder";
import type { AutomationWorkspaceArea, AutomationWorkspacePrefs } from "../workspace/layout";
import type {
  AutomationStudioOverlayDispatchers,
  LayoutPickerOverlayCommand,
  PreferencesOverlayCommand,
  ViewAdderOverlayCommand
} from "../workspace/overlays";
import {
  createAutomationStudioOverlayController,
  createAutomationStudioOverlayStore
} from "../workspace/overlays";

type OverlayAnchor = { top: number; right: number; bottom: number; left: number };

export type AutomationStudioLiveOverlayBindings = {
  activeProjectId: string | null;
  addView(command: ViewAdderOverlayCommand): void | Promise<void>;
  arrangeLayout(command: LayoutPickerOverlayCommand): void | Promise<void>;
  getPreferences(): AutomationWorkspacePrefs;
  getPreferencesSaveStatus(): string;
  getViewAdderOptions(area: AutomationWorkspaceArea): readonly AutomationViewAdderOption[];
  replacePreferences(command: PreferencesOverlayCommand): void | Promise<void>;
};

export function createAutomationStudioLiveOverlayComposition(
  initialBindings: AutomationStudioLiveOverlayBindings
) {
  const store = createAutomationStudioOverlayStore();
  const controller = createAutomationStudioOverlayController(store);
  let bindings = initialBindings;
  let projectId = initialBindings.activeProjectId;
  let requestSequence = 0;
  const requestId = (channel: string) => [projectId ?? "studio", channel, ++requestSequence].join(":");
  const assertCurrent = (channel: "preferences" | "viewAdder" | "layoutPicker", id: string) => {
    if (controller[channel].current()?.id !== id) {
      throw new Error("This overlay request is no longer active.");
    }
  };

  const dispatchers: AutomationStudioOverlayDispatchers = {
    preferences: async (command) => {
      assertCurrent("preferences", command.requestId);
      await bindings.replacePreferences(command as PreferencesOverlayCommand);
    },
    view: async (command) => {
      assertCurrent("viewAdder", command.requestId);
      await bindings.addView(command as ViewAdderOverlayCommand);
    },
    layout: async (command) => {
      assertCurrent("layoutPicker", command.requestId);
      await bindings.arrangeLayout(command as LayoutPickerOverlayCommand);
    }
  };

  return {
    controller,
    dispatchers,
    store,
    updateBindings(next: AutomationStudioLiveOverlayBindings) {
      bindings = next;
    },
    resetProject(nextProjectId: string | null) {
      if (projectId === nextProjectId) return [];
      projectId = nextProjectId;
      return controller.closeAll();
    },
    dispose: () => controller.closeAll(),
    openPreferences() {
      controller.preferences.open({
        id: requestId("preferences"),
        prefs: bindings.getPreferences(),
        saveStatus: bindings.getPreferencesSaveStatus()
      });
    },
    openViewAdder(area: AutomationWorkspaceArea, targetWindowId: string, anchor: OverlayAnchor) {
      controller.viewAdder.open({
        id: requestId("view-adder"),
        area,
        targetWindowId,
        anchor,
        options: bindings.getViewAdderOptions(area)
      });
    },
    openLayoutPicker(area: AutomationWorkspaceArea, anchor: OverlayAnchor) {
      controller.layoutPicker.open({ id: requestId("layout-picker"), area, anchor });
    },
    openDataInspector() {
      controller.dataInspector.open({
        id: requestId("data-inspector"),
        activeProjectId: bindings.activeProjectId
      });
    }
  };
}

export type AutomationStudioLiveOverlayComposition =
  ReturnType<typeof createAutomationStudioLiveOverlayComposition>;

export function useAutomationStudioLiveOverlays(bindings: AutomationStudioLiveOverlayBindings) {
  const composition = useMemo(
    () => createAutomationStudioLiveOverlayComposition(bindings),
    []
  );
  composition.updateBindings(bindings);
  useEffect(() => {
    composition.resetProject(bindings.activeProjectId);
  }, [bindings.activeProjectId, composition]);
  useEffect(() => () => {
    composition.dispose();
  }, [composition]);
  return composition;
}