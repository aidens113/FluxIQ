"use client";

import type { ReactNode } from "react";
import type { AutomationStudioUiStore } from "../workspace/studio-ui-store";
import type {
  AutomationWorkspaceBreadcrumb,
  AutomationWorkspaceChromeCommands,
  AutomationWorkspaceHeaderCommands,
  AutomationWorkspaceViewSource
} from "../workspace/shell/contracts";
import { AutomationWorkspaceShell } from "../workspace/shell/WorkspaceShell";
import { useAutomationWorkspaceSelector } from "../workspace/shell/selectors";
import type {
  AutomationWorkspaceCommandPort,
  AutomationWorkspaceCommands
} from "../workspace/commands/contracts";
import type { AutomationWarmViewRegistry } from "../workspace/commands/warm-activation";
import type { AutomationWorkspaceRenderStore } from "../workspace/render-store";

export function AutomationStudioWorkspaceSurface(props: {
  chrome: AutomationWorkspaceChromeCommands;
  commands: AutomationWorkspaceCommands;
  headerCommands: Omit<AutomationWorkspaceHeaderCommands, "activateBreadcrumb"> & {
    activateBreadcrumb(crumb: AutomationWorkspaceBreadcrumb): void;
  };
  hierarchy: ReactNode;
  port: AutomationWorkspaceCommandPort;
  projectKey: string;
  resolveBreadcrumbs(viewId: string): readonly AutomationWorkspaceBreadcrumb[];
  showDataInspector?: boolean;
  source: AutomationWorkspaceViewSource;
  store: AutomationWorkspaceRenderStore;
  studioUiStore: AutomationStudioUiStore;
  timeline: ReactNode;
  warm: AutomationWarmViewRegistry;
}) {
  const activeViewId = useAutomationWorkspaceSelector(props.store, (prefs) => {
    const activePane = prefs.panes.find((pane) => pane.id === prefs.activePaneId) ?? prefs.panes[0];
    return activePane?.activeViewId ?? prefs.activeViewId;
  });

  return (
    <AutomationWorkspaceShell
      breadcrumbs={props.resolveBreadcrumbs(activeViewId)}
      chrome={props.chrome}
      commands={props.commands}
      headerCommands={props.headerCommands}
      port={props.port}
      projectKey={props.projectKey}
      source={props.source}
      store={props.store}
      studioUiStore={props.studioUiStore}
      surfaces={{ hierarchy: props.hierarchy, timeline: props.timeline }}
      warm={props.warm}
      {...(props.showDataInspector !== undefined
        ? { showDataInspector: props.showDataInspector }
        : {})}
    />
  );
}