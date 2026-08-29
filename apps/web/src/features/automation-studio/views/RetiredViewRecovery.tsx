"use client";

import type { AutomationViewInstance } from "./view-types";
import type { RetiredAutomationStudioViewId } from "./view-registry";

export type AutomationRetiredViewRecoveryProps = {
  view: AutomationViewInstance;
  retiredId: RetiredAutomationStudioViewId;
};

export function AutomationRetiredViewRecovery(props: AutomationRetiredViewRecoveryProps) {
  const configRetired = props.retiredId === "config" || props.retiredId === "config-default";
  return (
    <section
      aria-label="Retired Automation Studio view"
      className="automation-project-empty automation-retired-view-recovery"
      data-retired-view-id={props.retiredId}
      data-view-id={props.view.id}
      role="status"
    >
      <strong>Saved view unavailable</strong>
      <span>
        {configRetired
          ? "This saved Config tab belongs to an older workspace. Select a Flow, then open Flow Settings to continue."
          : "This saved tab belongs to an older review workflow. Select a Flow, then open Adaptations to continue."}
      </span>
      <small>{configRetired
        ? "Closing this tab does not remove Flow settings or project data."
        : "Closing this tab does not remove recordings, runtime history, or adaptation data."}</small>
    </section>
  );
}
