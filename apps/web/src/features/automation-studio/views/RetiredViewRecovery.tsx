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
      aria-label="Tab from an older version of FluxIQ"
      className="automation-project-empty automation-retired-view-recovery"
      data-retired-view-id={props.retiredId}
      data-view-id={props.view.id}
      role="status"
    >
      <strong>This tab is no longer available</strong>
      <span>
        {configRetired
          ? "This tab was saved by an older version of FluxIQ. Pick an automation, then open Settings to carry on."
          : "This tab was saved by an older review screen. Pick an automation, then open Suggested changes to carry on."}
      </span>
      <small>{configRetired
        ? "Closing this tab does not change any settings or remove project data."
        : "Closing this tab does not remove recordings, past runs, or suggested changes."}</small>
    </section>
  );
}
