"use client";

import { memo, useEffect, useSyncExternalStore } from "react";
import { AutomationViewHost } from "../../views/ViewHost";
import { scheduleAutomationViewSurfacePreload } from "../../views/view-surface-preloader";
import type { AutomationWarmViewRegistry } from "../commands/warm-activation";
import type { AutomationWorkspaceViewSource } from "./contracts";
import { useAutomationWorkspaceView } from "./view-source";

export const AutomationMountedViewStack = memo(function AutomationMountedViewStack(props: {
  activePane: boolean;
  activeViewId: string;
  paneId: string;
  projectKey: string;
  source: AutomationWorkspaceViewSource;
  tabIds: readonly string[];
  warm: AutomationWarmViewRegistry;
}) {
  const surfacePreloadKey = props.tabIds.join("\u001f");
  useEffect(() => scheduleAutomationViewSurfacePreload(surfacePreloadKey.split("\u001f")), [surfacePreloadKey]);
  return (
    <div className="automation-mounted-view-stack">
      {props.tabIds.map((viewId) => (
        <AutomationMountedView
          active={props.activePane && props.activeViewId === viewId}
          key={`${props.projectKey}:${props.paneId}:${viewId}`}
          paneId={props.paneId}
          source={props.source}
          viewId={viewId}
          warm={props.warm}
        />
      ))}
    </div>
  );
});

const AutomationMountedView = memo(function AutomationMountedView(props: {
  active: boolean;
  paneId: string;
  source: AutomationWorkspaceViewSource;
  viewId: string;
  warm: AutomationWarmViewRegistry;
}) {
  const entry = useAutomationWorkspaceView(props.source, props.viewId);
  useSyncExternalStore(props.warm.subscribe, props.warm.getRevision, props.warm.getRevision);
  const activity = props.warm.activity(props.paneId, props.viewId);
  activity.current = props.active;
  const keepMounted = props.active || props.warm.isWarm(props.paneId, props.viewId);
  useEffect(() => {
    if (props.active) props.warm.markWarm(props.paneId, props.viewId);
  }, [props.active, props.paneId, props.viewId, props.warm]);
  useEffect(() => () => {
    activity.current = false;
  }, [activity]);
  if (!entry) return null;
  if (!keepMounted) return null;
  return (
    <div
      aria-hidden={!props.active}
      className={["automation-mounted-view", entry.bodyClassName ?? ""].filter(Boolean).join(" ")}
      data-active={props.active ? "true" : "false"}
      data-view-id={props.viewId}
    >
      <AutomationViewHost
        active={props.active}
        activeRef={activity}
        keepMounted={keepMounted}
        request={entry.request}
      />
    </div>
  );
});
