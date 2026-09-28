import type { AutomationViewInstance } from "../views/view-types";
import { automationStudioViewDefinition } from "../views/view-registry";
import type { AutomationWorkspaceArea } from "./layout/contracts";
import { automationWorkspaceRegionForView } from "./layout/regions";

export type AutomationViewAdderContext = {
  hasProject: boolean;
  hasFlow: boolean;
  hasTopLevelFlow: boolean;
  hasSubflowGraph: boolean;
  hasRecording: boolean;
  hasSelection: boolean;
};

export type AutomationViewAdderOption = {
  view: AutomationViewInstance;
  group: "Flow" | "Evidence" | "Workspace";
  groupLabel: string;
  placement: string;
  scope: string;
  disabledReason: string | null;
};

/**
 * "Flow", "Evidence" and "Workspace" are stable internal group keys, exactly as view
 * ids are. This is the only place that turns one into words a first-time user reads.
 */
const groupLabels: Record<AutomationViewAdderOption["group"], string> = {
  Flow: "This automation",
  Evidence: "What happened",
  Workspace: "This project"
};

export function automationViewGroupLabel(group: AutomationViewAdderOption["group"]): string {
  return groupLabels[group];
}

const contextLabels: Record<keyof AutomationViewAdderContext, string> = {
  hasProject: "Open a project first",
  hasFlow: "Pick an automation first",
  hasTopLevelFlow: "Pick a whole automation first",
  hasSubflowGraph: "Pick a reusable part first",
  hasRecording: "Pick a recording first",
  hasSelection: "Select something first"
};

export function automationViewAdderOptions(
  views: AutomationViewInstance[],
  area: AutomationWorkspaceArea,
  context: AutomationViewAdderContext,
  openViewIds: ReadonlySet<string>
): AutomationViewAdderOption[] {
  return views.flatMap((view) => {
    const rule = automationStudioViewDefinition(view.id);
    if (!rule?.addable || automationWorkspaceRegionForView(view.id) !== area) return [];
    const missingContext = rule.requires && !context[rule.requires] ? contextLabels[rule.requires] : null;
    const alreadyOpen = openViewIds.has(view.id) ? "Already open in this workspace" : null;
    return [{
      view,
      group: rule.group,
      groupLabel: automationViewGroupLabel(rule.group),
      placement: area === "right" ? "Details panel" : "Main area",
      scope: rule.scope,
      disabledReason: missingContext ?? alreadyOpen
    }];
  });
}
