"use client";

import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import type { AutomationViewInstance } from "./view-types";
import type { AutomationViewReadiness } from "./view-readiness";

/**
 * Every empty panel used to read "No data yet. <Label> has no data for the current
 * scope." - the same sentence whether the panel was genuinely empty or simply pointed
 * at the wrong thing, and never a way out of either. Each panel now says what would
 * appear in it and what a person does to make that happen. Keyed by view type rather
 * than by view id, so canonical ids stay owned by the registry.
 */
const emptyStateCopy: Partial<Record<AutomationViewInstance["type"], { title: string; body: string }>> = {
  clients: {
    title: "No browsers connected yet",
    body: "Pair a browser that has the FluxIQ extension installed and it appears here, ready to record and to act."
  },
  recordings: {
    title: "Nothing recorded yet",
    body: "Record yourself using the site, then pick that recording to replay every step it captured."
  },
  design: {
    title: "This part has no steps yet",
    body: "Add a step here, or open Run and test, describe the job in your own words, and let FluxIQ draft the steps for you."
  },
  router: {
    title: "No paths yet",
    body: "Add a rule that decides which reusable part handles a run. Until you do, every run takes the same route."
  },
  subflows: {
    title: "No reusable parts yet",
    body: "Create a part to group steps you want to use in more than one place, such as signing in."
  },
  instructions: {
    title: "No guidance written yet",
    body: "Write a note telling FluxIQ how to handle this automation: which account to use, what to avoid, what counts as finished."
  },
  adaptations: {
    title: "No suggested changes",
    body: "When a run meets something unexpected and FluxIQ works around it, the change appears here for you to keep or to undo."
  },
  settings: {
    title: "No settings to show",
    body: "Pick an automation, or one of its reusable parts, in the sidebar to change how it runs."
  },
  state: {
    title: "Nothing captured yet",
    body: "Run this automation or open a recording, then pick a step to see the page exactly as it was at that moment."
  },
  runtime: {
    title: "This automation has not run yet",
    body: "Describe what you want automated and press Run. Every run, and what it produced, is listed here."
  },
  runs: {
    title: "No runs yet",
    body: "Once this automation has run at least once, every run and what it produced is listed here."
  },
  problems: {
    title: "No problems found",
    body: "Anything that would stop an automation running, such as a missing value or a step that no longer matches the page, is listed here."
  },
  inspector: {
    title: "Nothing selected",
    body: "Pick a step, a reusable part or a whole automation and its details appear here."
  }
};

function automationViewEmptyCopy(view: AutomationViewInstance): { title: string; body: string } {
  return emptyStateCopy[view.type] ?? {
    title: "Nothing to show yet",
    body: `${view.label} has nothing to show for what you have selected.`
  };
}

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
  const copy = automationViewEmptyCopy(props.view);
  return (
    <AutomationViewStateSurface state="empty" view={props.view}>
      <strong>{copy.title}</strong>
      <span>{props.message ?? copy.body}</span>
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
