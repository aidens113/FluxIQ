"use client";

import type { AutomationStudioUiStore } from "../studio-ui-store";
import { useAutomationNarrowWorkspace } from "../studio-ui-store";
import type { AutomationWorkspaceCommandPort, AutomationWorkspaceCommands } from "../commands/contracts";
import type { AutomationWarmViewRegistry } from "../commands/warm-activation";
import type { AutomationWorkspaceRenderStore } from "../render-store";
import { defaultAutomationRightSidebarPrefs } from "../layout/defaults";
import type {
  AutomationWorkspaceBreadcrumb,
  AutomationWorkspaceChromeCommands,
  AutomationWorkspaceHeaderCommands,
  AutomationWorkspaceShellSurfaces,
  AutomationWorkspaceViewSource
} from "./contracts";
import { AutomationHierarchyRegion } from "./HierarchyRegion";
import { AutomationPaneArea } from "./PaneArea";
import { AutomationResponsiveDrawers } from "./ResponsiveDrawers";
import { AutomationRightPaneArea } from "./RightPaneArea";
import { useAutomationWorkspaceSelector } from "./selectors";
import { AutomationTimelineDock } from "./TimelineDock";
import { useAutomationWorkspaceView } from "./view-source";
import { AutomationWorkspaceHeader } from "./WorkspaceHeader";

export function AutomationWorkspaceShell(props: {
  breadcrumbs: readonly AutomationWorkspaceBreadcrumb[];
  chrome: AutomationWorkspaceChromeCommands;
  commands: AutomationWorkspaceCommands;
  headerCommands: AutomationWorkspaceHeaderCommands;
  port: AutomationWorkspaceCommandPort;
  projectKey: string;
  showDataInspector?: boolean;
  source: AutomationWorkspaceViewSource;
  store: AutomationWorkspaceRenderStore;
  studioUiStore: AutomationStudioUiStore;
  surfaces: AutomationWorkspaceShellSurfaces;
  warm: AutomationWarmViewRegistry;
}) {
  const shell = useAutomationWorkspaceSelector(props.store, (prefs) => ({
    density: prefs.density,
    motion: prefs.motion,
    sidebarCollapsed: prefs.leftSidebarCollapsed,
    sidebarWidth: prefs.sidebarWidth
  }), (left, right) => left.density === right.density
    && left.motion === right.motion
    && left.sidebarCollapsed === right.sidebarCollapsed
    && left.sidebarWidth === right.sidebarWidth);
  const activeRightViewId = useAutomationWorkspaceSelector(
    props.store,
    (prefs) => prefs.rightSidebar.activeViewId || defaultAutomationRightSidebarPrefs().activeViewId
  );
  const activeRightView = useAutomationWorkspaceView(props.source, activeRightViewId);
  const { isNarrowWorkspace, narrowWorkspacePanel } = useAutomationNarrowWorkspace(props.studioUiStore);
  const inspectorLabel = activeRightView?.view.label ?? "Inspector";
  const hierarchy = (
    <AutomationHierarchyRegion content={props.surfaces.hierarchy} port={props.port} store={props.store} />
  );
  const rightPane = (
    <AutomationRightPaneArea
      chrome={props.chrome}
      commands={props.commands}
      forceExpanded={isNarrowWorkspace}
      port={props.port}
      projectKey={props.projectKey}
      source={props.source}
      store={props.store}
      warm={props.warm}
    />
  );
  const timeline = (
    <AutomationTimelineDock
      commands={props.commands}
      content={props.surfaces.timeline}
      forceExpanded={isNarrowWorkspace}
      port={props.port}
      store={props.store}
    />
  );

  return (
    <section
      className={`automation-studio-shell${shell.sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      data-density={shell.density}
      data-motion={shell.motion}
      data-narrow={isNarrowWorkspace ? "true" : "false"}
      style={{ gridTemplateColumns: `${shell.sidebarCollapsed ? 48 : shell.sidebarWidth}px minmax(0, 1fr)` }}
    >
      {!isNarrowWorkspace ? hierarchy : null}
      <div className="automation-studio-main">
        <AutomationWorkspaceHeader
          breadcrumbs={props.breadcrumbs}
          chrome={props.chrome}
          commands={props.headerCommands}
          inspectorLabel={inspectorLabel}
          narrow={isNarrowWorkspace}
          narrowPanel={narrowWorkspacePanel}
          {...(props.showDataInspector !== undefined ? { showDataInspector: props.showDataInspector } : {})}
        />
        <AutomationWorkspaceGrid
          chrome={props.chrome}
          commands={props.commands}
          narrow={isNarrowWorkspace}
          port={props.port}
          projectKey={props.projectKey}
          rightPane={rightPane}
          source={props.source}
          store={props.store}
          timeline={timeline}
          warm={props.warm}
        />
      </div>
      {isNarrowWorkspace ? (
        <AutomationResponsiveDrawers
          chrome={props.chrome}
          hierarchy={hierarchy}
          inspector={rightPane}
          inspectorTitle={inspectorLabel}
          panel={narrowWorkspacePanel}
          timeline={timeline}
        />
      ) : null}
    </section>
  );
}

function AutomationWorkspaceGrid(props: {
  chrome: AutomationWorkspaceChromeCommands;
  commands: AutomationWorkspaceCommands;
  narrow: boolean;
  port: AutomationWorkspaceCommandPort;
  projectKey: string;
  rightPane: React.ReactNode;
  source: AutomationWorkspaceViewSource;
  store: AutomationWorkspaceRenderStore;
  timeline: React.ReactNode;
  warm: AutomationWarmViewRegistry;
}) {
  const grid = useAutomationWorkspaceSelector(props.store, (prefs) => ({
    rightCollapsed: prefs.rightSidebarCollapsed,
    rightWidth: prefs.inspectorWidth,
    timelineCollapsed: prefs.bottomTimelineCollapsed,
    timelineHeight: prefs.bottomTimelineHeight
  }), (left, right) => left.rightCollapsed === right.rightCollapsed
    && left.rightWidth === right.rightWidth
    && left.timelineCollapsed === right.timelineCollapsed
    && left.timelineHeight === right.timelineHeight);
  return (
    <section
      className={`automation-studio-workspace${grid.rightCollapsed ? " right-collapsed" : ""}`}
      style={{
        gridTemplateColumns: `minmax(0, 1fr) ${grid.rightCollapsed ? 38 : grid.rightWidth}px`,
        gridTemplateRows: `minmax(0, 1fr) ${grid.timelineCollapsed ? 38 : grid.timelineHeight}px`
      }}
    >
      <AutomationPaneArea
        chrome={props.chrome}
        commands={props.commands}
        narrow={props.narrow}
        port={props.port}
        projectKey={props.projectKey}
        source={props.source}
        store={props.store}
        warm={props.warm}
      />
      {!props.narrow ? props.rightPane : null}
      {!props.narrow ? props.timeline : null}
    </section>
  );
}
