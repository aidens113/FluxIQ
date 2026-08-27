import type { AutomationViewInstance } from "../types";
import { automationWorkspaceRegionForView, type AutomationWorkspaceArea } from "./layout";

export type AutomationViewAdderContext = {
  hasProject: boolean;
  hasFlow: boolean;
  hasRecording: boolean;
  hasSelection: boolean;
};

export type AutomationViewAdderOption = {
  view: AutomationViewInstance;
  group: "Flow" | "Evidence" | "Workspace";
  placement: string;
  scope: string;
  disabledReason: string | null;
};

type ViewRule = {
  group: AutomationViewAdderOption["group"];
  requires?: keyof AutomationViewAdderContext;
  scope: string;
};

const viewRules: Record<string, ViewRule> = {
  "client-gateway": { group: "Workspace", requires: "hasProject", scope: "Current project" },
  "timeline-recording": { group: "Evidence", requires: "hasRecording", scope: "Selected recording" },
  "policy-primary": { group: "Flow", requires: "hasFlow", scope: "Selected Flow or subflow" },
  "flow-router": { group: "Flow", requires: "hasFlow", scope: "Selected top-level Flow" },
  "flow-subflows": { group: "Flow", requires: "hasFlow", scope: "Selected Flow" },
  "flow-instructions": { group: "Flow", requires: "hasFlow", scope: "Selected Flow or subflow" },
  adaptations: { group: "Flow", requires: "hasFlow", scope: "Selected Flow or subflow" },
  "flow-settings": { group: "Flow", requires: "hasFlow", scope: "Selected Flow or subflow" },
  "state-explorer": { group: "Evidence", requires: "hasSelection", scope: "Current selection" },
  "runtime-debug": { group: "Evidence", requires: "hasFlow", scope: "Selected Flow" },
  "problems-view": { group: "Evidence", requires: "hasProject", scope: "Current project" },
  "global-inspector": { group: "Workspace", requires: "hasProject", scope: "Current selection" }
};

const contextLabels: Record<keyof AutomationViewAdderContext, string> = {
  hasProject: "Open a project first",
  hasFlow: "Select a Flow or subflow first",
  hasRecording: "Select a recording first",
  hasSelection: "Select an object first"
};

export function automationViewAdderOptions(
  views: AutomationViewInstance[],
  area: AutomationWorkspaceArea,
  context: AutomationViewAdderContext,
  openViewIds: ReadonlySet<string>
): AutomationViewAdderOption[] {
  return views.flatMap((view) => {
    const rule = viewRules[view.id];
    if (!rule || automationWorkspaceRegionForView(view.id) !== area) return [];
    const missingContext = rule.requires && !context[rule.requires] ? contextLabels[rule.requires] : null;
    const alreadyOpen = openViewIds.has(view.id) ? "Already open in this workspace" : null;
    return [{
      view,
      group: rule.group,
      placement: area === "right" ? "Inspector tab" : "Main editor tab",
      scope: rule.scope,
      disabledReason: missingContext ?? alreadyOpen
    }];
  });
}