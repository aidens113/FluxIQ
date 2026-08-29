"use client";

import { memo, useEffect, useState } from "react";
import { AutomationViewHost } from "../../views/ViewHost";
import { useAutomationMountedViewActivation, type AutomationMountedViewActivationStore } from "../components/mounted-view-activation";
import type { AutomationWarmViewRegistry } from "../commands/warm-activation";
import type { AutomationWorkspaceViewSource } from "./contracts";
import { useAutomationWorkspaceView } from "./view-source";

export const AutomationMountedViewStack = memo(function AutomationMountedViewStack(props: {
  activePane: boolean;
  activeViewId: string;
  activation: AutomationMountedViewActivationStore;
  paneId: string;
  projectKey: string;
  source: AutomationWorkspaceViewSource;
  tabIds: readonly string[];
  warm: AutomationWarmViewRegistry;
}) {
  const [localActiveViewId, setLocalActiveViewId] = useState(props.activeViewId);
  const activation = useAutomationMountedViewActivation(props.activation, props.paneId);
  const activeViewId = activation.activeViewId ?? localActiveViewId;
  const activePane = activation.activeWindow ?? props.activePane;
  useEffect(() => setLocalActiveViewId(props.activeViewId), [props.activeViewId]);
  useEffect(
    () => props.warm.subscribe(props.paneId, setLocalActiveViewId),
    [props.paneId, props.warm]
  );
  return (
    <div className="automation-mounted-view-stack">
      {props.tabIds.map((viewId) => (
        <AutomationMountedView
          active={activePane && activeViewId === viewId}
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
  const activity = props.warm.activity(props.paneId, props.viewId);
  activity.current = props.active;
  const keepMounted = props.active || props.warm.isWarm(props.paneId, props.viewId);
  useEffect(() => {
    if (props.active) props.warm.markWarm(props.paneId, props.viewId);
  }, [props.active, props.paneId, props.viewId, props.warm]);
  if (!entry) return null;
  return (
    <div
      aria-hidden={!props.active}
      className={["automation-mounted-view", entry.bodyClassName ?? ""].filter(Boolean).join(" ")}
      data-view-id={props.viewId}
      hidden={!props.active}
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
