"use client";

import { memo, useMemo, type ComponentProps, type ReactNode } from "react";
import type { CurrentUser } from "../../programs/types";
import { AutomationStudioWorkspaceSurface } from "./AutomationStudioWorkspaceSurface";
import { AutomationStudioOverlays } from "../workspace/overlays";
import { useAutomationStudioLiveOverlays } from "./useAutomationStudioLiveOverlays";
import { automationViewAdderOptions } from "../workspace/view-adder";
import type { AutomationViewInstance } from "../views/view-types";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationWorkspaceArea, AutomationWorkspacePrefs } from "../workspace/layout";
import type { AutomationWorkspaceBreadcrumb, AutomationWorkspaceViewSource } from "../workspace/shell/contracts";
import type { createAutomationWorkspaceCommands } from "../workspace/commands/workspace-commands";
import type { createAutomationWorkspaceCommandPort } from "../workspace/commands/port";
import type { createAutomationWarmViewRegistry } from "../workspace/commands/warm-activation";
import { DirtyViewGuard } from "../workspace/DirtyViewGuard";
import type { useAutomationStudioStoreOwners } from "../stores";
import {
  automationStudioObjectViewInstanceId,
  automationStudioViewObjectId
} from "../views/view-registry";

type Owners = ReturnType<typeof useAutomationStudioStoreOwners>;
type WorkspaceCommands = ReturnType<typeof createAutomationWorkspaceCommands>;
type WorkspacePort = ReturnType<typeof createAutomationWorkspaceCommandPort>;
type WarmRegistry = ReturnType<typeof createAutomationWarmViewRegistry>;

type ProjectBinding = {
  id: string;
  name: string;
  getViewAdderContext(): {
    selectedFlow: boolean;
    selectedTopLevelFlow: boolean;
    selectedRecording: boolean;
    selection: AutomationSelection | null;
  };
};
type WorkspaceBinding = {
  commands: WorkspaceCommands;
  port: WorkspacePort;
  warm: WarmRegistry;
  store: Owners["workspaceRenderStore"];
  studioUiStore: Owners["studioUiStore"];
  updatePrefs: (updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs, options?: { persist?: boolean }) => void;
};
type ViewBindingBase = {
  instances: AutomationViewInstance[];
  openIds: ReadonlySet<string>;
  resolveBreadcrumbs: (viewId: string) => AutomationWorkspaceBreadcrumb[];
};
type ViewBinding = ViewBindingBase & {
  source: AutomationWorkspaceViewSource;
};
type HeaderBinding = {
  closeProject: () => void;
  activateBreadcrumb: (crumb: AutomationWorkspaceBreadcrumb) => void;
  openRuntime: () => void;
  requestWorkspaceSave: () => void;
};
type InspectorBinding = {
  api: NonNullable<ComponentProps<typeof AutomationStudioOverlays>["dataInspector"]>["api"];
  cacheStats: NonNullable<ComponentProps<typeof AutomationStudioOverlays>["dataInspector"]>["cacheStats"];
};

export type AutomationStudioWorkspaceCompositionProps = {
  currentUser: CurrentUser;
  project: ProjectBinding;
  workspace: WorkspaceBinding;
  views: ViewBinding;
  header: HeaderBinding;
  hierarchy: ReactNode;
  timeline: ReactNode;
  inspector: InspectorBinding;
};

export const AutomationStudioWorkspaceComposition = memo(function AutomationStudioWorkspaceComposition(
  props: AutomationStudioWorkspaceCompositionProps
) {
  const overlays = useAutomationStudioLiveOverlays({
    activeProjectId: props.project.id,
    getPreferences: props.workspace.store.getPrefs,
    getPreferencesSaveStatus: props.workspace.store.getSaveStatus,
    getViewAdderOptions: (area) => {
      const context = props.project.getViewAdderContext();
      const flowId = flowIdForSelection(context.selection);
      const canonicalViews = props.views.instances.filter((view) => !automationStudioViewObjectId(view.id));
      const contextualOpenViewIds = new Set(canonicalViews.flatMap((view) => (
        props.views.openIds.has(automationStudioObjectViewInstanceId(view.id, flowId)) ? [view.id] : []
      )));
      return automationViewAdderOptions(
        canonicalViews,
        area,
        {
          hasProject: true,
          hasFlow: context.selectedFlow,
          hasTopLevelFlow: context.selectedTopLevelFlow,
          hasRecording: context.selectedRecording,
          hasSelection: Boolean(context.selection)
        },
        contextualOpenViewIds
      );
    },
    replacePreferences: (command) => {
      props.workspace.updatePrefs(() => command.prefs as AutomationWorkspacePrefs, { persist: true });
    },
    addView: (command) => {
      const selection = props.project.getViewAdderContext().selection;
      const flowId = flowIdForSelection(selection);
      const instanceId = automationStudioObjectViewInstanceId(command.viewId, flowId);
      if (command.targetWindowId === "right-sidebar") props.workspace.commands.addRightTab(instanceId);
      else if (command.targetWindowId) props.workspace.commands.addPaneTab(command.targetWindowId, instanceId);
      else props.workspace.commands.openView(instanceId);
    },
    arrangeLayout: (command) => {
      const preset = command.preset === "two-columns" ? "two-even"
        : command.preset === "main-sidebar" ? "two-main-side"
          : command.preset === "three-columns" || command.preset === "quad" ? "three-main-two"
            : command.preset === "two-rows" ? "two-rows" : "single";
      props.workspace.commands.applyLayoutPreset(preset);
    }
  });
  const chrome = useMemo(() => ({
    openLayoutPicker(area: AutomationWorkspaceArea, anchor: DOMRect) {
      overlays.openLayoutPicker(area, rect(anchor));
    },
    openViewAdder(area: AutomationWorkspaceArea, targetWindowId: string, anchor: DOMRect) {
      overlays.openViewAdder(area, targetWindowId, rect(anchor));
    },
    setNarrowPanel(panel: "hierarchy" | "inspector" | "timeline" | null) {
      props.workspace.studioUiStore.patch({ narrowWorkspacePanel: panel });
    }
  }), [overlays, props.workspace.studioUiStore]);
  const headerCommands = useMemo(() => ({
    closeProject: props.header.closeProject,
    activateBreadcrumb: props.header.activateBreadcrumb,
    openDataInspector: overlays.openDataInspector,
    openPreferences: overlays.openPreferences,
    openRuntime: props.header.openRuntime,
    requestWorkspaceSave: props.header.requestWorkspaceSave
  }), [overlays, props.header.activateBreadcrumb, props.header.closeProject, props.header.openRuntime, props.header.requestWorkspaceSave]);
  const inspector = useMemo(
    () => ({ api: props.inspector.api, cacheStats: props.inspector.cacheStats }),
    [props.inspector.api, props.inspector.cacheStats]
  );

  return <>
    <AutomationStudioWorkspaceSurface
      chrome={chrome}
      commands={props.workspace.commands}
      headerCommands={headerCommands}
      hierarchy={props.hierarchy}
      port={props.workspace.port}
      projectKey={props.project.id}
      resolveBreadcrumbs={props.views.resolveBreadcrumbs}
      showDataInspector={process.env.NODE_ENV !== "production"}
      source={props.views.source}
      store={props.workspace.store}
      studioUiStore={props.workspace.studioUiStore}
      timeline={props.timeline}
      warm={props.workspace.warm}
    />
    <AutomationStudioOverlays
      dataInspector={inspector}
      dispatchers={overlays.dispatchers}
      pinConfigured={Boolean(props.currentUser.pinConfigured)}
      store={overlays.store}
    />
    <DirtyViewGuard />
  </>;
});

function flowIdForSelection(selection: AutomationSelection | null): string | null {
  if (selection?.kind === "flow") return selection.id;
  if (selection?.kind === "editor-node" || selection?.kind === "editor-mode") return selection.flowId ?? null;
  return null;
}

function rect(anchor: DOMRect) {
  return { top: anchor.top, right: anchor.right, bottom: anchor.bottom, left: anchor.left };
}
