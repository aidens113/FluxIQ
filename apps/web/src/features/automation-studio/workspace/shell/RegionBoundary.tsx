"use client";

import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";

type AutomationRegionBoundaryProps = {
  children: ReactNode;
  label: string;
  resetKey: string;
};

type AutomationRegionBoundaryState = {
  failed: boolean;
};

export class AutomationRegionBoundary extends Component<
  AutomationRegionBoundaryProps,
  AutomationRegionBoundaryState
> {
  state: AutomationRegionBoundaryState = { failed: false };

  static getDerivedStateFromError(): AutomationRegionBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Region failure is intentionally contained; diagnostics remain available
    // through the development telemetry and browser error pipeline.
  }

  componentDidUpdate(previous: AutomationRegionBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="automation-region-state error" role="alert">
          <strong>{this.props.label} could not be displayed</strong>
          <span>Switch views or reopen the project to retry this region.</span>
        </div>
      );
    }
    return (
      <Suspense fallback={<AutomationRegionLoading label={this.props.label} />}>
        {this.props.children}
      </Suspense>
    );
  }
}

function AutomationRegionLoading(props: { label: string }) {
  return (
    <div aria-live="polite" className="automation-region-state loading" role="status">
      <span className="automation-region-loading-indicator" aria-hidden />
      <span>Loading {props.label.toLocaleLowerCase()}...</span>
    </div>
  );
}
