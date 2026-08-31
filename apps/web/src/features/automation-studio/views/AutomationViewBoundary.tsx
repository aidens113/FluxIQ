"use client";

import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import type { AutomationViewInstance } from "./view-types";
import type { AutomationViewReadiness } from "./view-readiness";

type LocalErrorBoundaryProps = { children: ReactNode; resetKey: string; view: AutomationViewInstance };
type LocalErrorBoundaryState = { error: Error | null };

class AutomationViewLocalErrorBoundary extends Component<LocalErrorBoundaryProps, LocalErrorBoundaryState> {
  state: LocalErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): LocalErrorBoundaryState {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Domain request failures belong to the connector; render failures remain local to this view.
  }

  componentDidUpdate(previous: LocalErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) return <AutomationViewErrorState error={this.state.error} view={this.props.view} />;
    return this.props.children;
  }
}

function AutomationViewStateSurface(props: {
  children: ReactNode;
  state: "loading" | "empty" | "error";
  view: AutomationViewInstance;
}) {
  return (
    <section
      aria-label={`${props.view.label} ${props.state}`}
      aria-live={props.state === "error" ? "assertive" : "polite"}
      className={`automation-view-state automation-view-state-${props.state}`}
      data-view-id={props.view.id}
      data-view-state={props.state}
      role={props.state === "error" ? "alert" : "status"}
    >
      {props.children}
    </section>
  );
}

export function AutomationViewLoadingState(props: { view: AutomationViewInstance }) {
  return (
    <AutomationViewStateSurface state="loading" view={props.view}>
      <div className="automation-view-loading">
        <span aria-hidden className="automation-view-loading-indicator" />
        <strong>Loading {props.view.label}</strong>
      </div>
    </AutomationViewStateSurface>
  );
}

export function AutomationViewEmptyState(props: { message?: string; view: AutomationViewInstance }) {
  return (
    <AutomationViewStateSurface state="empty" view={props.view}>
      <strong>No data yet</strong>
      <span>{props.message ?? `${props.view.label} has no data for the current scope.`}</span>
    </AutomationViewStateSurface>
  );
}

export function AutomationViewErrorState(props: { error: Error; view: AutomationViewInstance }) {
  return (
    <AutomationViewStateSurface state="error" view={props.view}>
      <strong>{props.view.label} could not be loaded</strong>
      <span>{props.error.message}</span>
    </AutomationViewStateSurface>
  );
}

export function AutomationViewBoundary<Model>(props: {
  readiness: AutomationViewReadiness<Model>;
  render(data: Model): ReactNode;
  view: AutomationViewInstance;
}) {
  const { readiness, view } = props;
  const resetKey = `${readiness.token.projectGeneration}:${readiness.token.requestToken}:${readiness.status}`;
  if (readiness.status === "loading") return <AutomationViewLoadingState view={view} />;
  if (readiness.status === "empty") {
    return <AutomationViewEmptyState {...(readiness.message === undefined ? {} : { message: readiness.message })} view={view} />;
  }
  if (readiness.status === "error") return <AutomationViewErrorState error={readiness.error} view={view} />;

  const content = (
    <AutomationViewLocalErrorBoundary resetKey={resetKey} view={view}>
      <Suspense fallback={<AutomationViewLoadingState view={view} />}>
        {props.render(readiness.data)}
      </Suspense>
    </AutomationViewLocalErrorBoundary>
  );
  if (readiness.status === "ready") return content;
  return (
    <section
      aria-busy="true"
      className="automation-view-stale-ready"
      data-view-id={view.id}
      data-view-state="stale-ready"
    >
      <div
        aria-live="polite"
        className="automation-view-stale-notice"
        role={readiness.error ? "alert" : "status"}
      >
        {readiness.error ? "Refresh failed. Showing the last available data." : "Refreshing..."}
      </div>
      {content}
    </section>
  );
}
