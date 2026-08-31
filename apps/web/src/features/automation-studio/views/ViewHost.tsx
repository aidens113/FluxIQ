"use client";

import { memo } from "react";
import type { AutomationViewInstance } from "./view-types";
import { AutomationViewBoundary } from "./AutomationViewBoundary";
import type { AutomationViewReadiness } from "./view-readiness";
import { AutomationRetiredViewRecovery } from "./RetiredViewRecovery";
import { automationStudioViewDefinitions, resolveAutomationStudioView } from "./view-registry";
import { automationViewHostRegistration, renderAutomationViewHostRequest } from "./view-host-registry";
import type { AutomationViewHostKind, AutomationViewHostRequest } from "./view-host-types";

const compatibilityViewKinds = new Map<string, AutomationViewHostKind>([
  ["routine", "routine"]
]);

const sleepingViewKinds = new Set<AutomationViewHostKind>([
  ...automationStudioViewDefinitions()
    .filter((definition) => definition.lifecycle.sleepUntilActivated)
    .map((definition) => definition.kind as AutomationViewHostKind),
  "routine"
]);

export type AutomationViewHostProps = {
  request: AutomationViewHostRequest;
  active: boolean;
  activeRef: { current: boolean };
  keepMounted?: boolean;
};

export function AutomationSleepingView(props: { view: AutomationViewInstance }) {
  return (
    <section
      aria-label={`Opening ${props.view.label}`}
      aria-live="polite"
      className="automation-view-sleeping"
      data-view-id={props.view.id}
      role="status"
    >
      <div className="automation-view-loading">
        <span aria-hidden className="automation-view-loading-indicator" />
        <strong>Opening {props.view.label}</strong>
      </div>
    </section>
  );
}

export function AutomationUnknownView(props: { view: AutomationViewInstance; reason?: "unknown" | "mismatch" }) {
  return (
    <section
      aria-label="Unavailable Automation Studio view"
      className="automation-project-empty"
      data-view-id={props.view.id}
      role="status"
    >
      <strong>View unavailable</strong>
      <span>
        {props.reason === "mismatch"
          ? "This saved view no longer matches its registered view type. Close the tab and reopen it from the Studio sidebar."
          : "This saved view is no longer registered. Close the tab and choose an available view from the Studio sidebar."}
      </span>
    </section>
  );
}

export function automationViewTypeCanSleep(type: AutomationViewInstance["type"]): boolean {
  return sleepingViewKinds.has(type as AutomationViewHostKind);
}

export const AutomationViewHost = memo(function AutomationViewHost(props: AutomationViewHostProps) {
  const resolution = resolveAutomationStudioView(props.request.view.id);
  const compatibilityKind = compatibilityViewKinds.get(props.request.view.id);
  if (resolution.status === "retired") {
    return <AutomationRetiredViewRecovery retiredId={resolution.id} view={props.request.view} />;
  }
  if (resolution.status === "unknown" && compatibilityKind !== props.request.kind) {
    return <AutomationUnknownView view={props.request.view} reason="unknown" />;
  }
  if (
    resolution.status === "known"
    && resolution.definition.kind !== props.request.kind
    && compatibilityKind !== props.request.kind
  ) {
    return <AutomationUnknownView view={props.request.view} reason="mismatch" />;
  }

  const keepMounted = props.keepMounted ?? false;
  if (!props.active && !keepMounted && sleepingViewKinds.has(props.request.kind)) {
    return <AutomationSleepingView view={props.request.view} />;
  }

  const activity = {
    active: props.active,
    activeRef: props.activeRef,
    keepMounted
  };
  if ("connect" in props.request) return props.request.connect(activity);

  const boundRequest = props.request;
  const registration = automationViewHostRegistration(boundRequest.kind);
  if (!registration) return <AutomationUnknownView view={props.request.view} reason="unknown" />;
  const readiness = boundRequest.readiness;
  return (
    <AutomationViewBoundary<unknown>
      readiness={readiness as AutomationViewReadiness<unknown>}
      render={(readyModel) => {
        const readyRequest = readyModel === boundRequest.binding.model
          ? boundRequest
          : {
            ...boundRequest,
            binding: { ...boundRequest.binding, model: readyModel }
          } as typeof boundRequest;
        return renderAutomationViewHostRequest(readyRequest, activity, registration.selectData(readyRequest));
      }}
      view={props.request.view}
    />
  );
}, automationViewHostPropsEqual);

function automationViewHostPropsEqual(previous: AutomationViewHostProps, next: AutomationViewHostProps): boolean {
  if (
    previous.request.view.id !== next.request.view.id
    || previous.request.kind !== next.request.kind
  ) return false;
  if (!previous.active && !next.active) return true;
  if (previous.active !== next.active || previous.keepMounted !== next.keepMounted) return false;
  if (
    previous.request.view.label !== next.request.view.label
    || previous.request.view.state !== next.request.view.state
  ) return false;
  if ("connect" in previous.request || "connect" in next.request) {
    return "connect" in previous.request
      && "connect" in next.request
      && previous.request.connect === next.request.connect;
  }
  if (previous.request.readiness !== next.request.readiness) return false;
  return shallowRecordEqual(previous.request.binding.model, next.request.binding.model)
    && shallowRecordEqual(previous.request.binding.commands, next.request.binding.commands);
}

function shallowRecordEqual(previous: object, next: object): boolean {
  if (previous === next) return true;
  const previousRecord = previous as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const keys = Object.keys(nextRecord);
  if (keys.length !== Object.keys(previousRecord).length) return false;
  return keys.every((key) => previousRecord[key] === nextRecord[key]);
}
