import type { AutomationViewInstance } from "../views/view-types";
import { automationStudioViewDefinition } from "../views/view-registry";
import type { AutomationWorkspaceArea } from "./layout/contracts";
import { automationWorkspaceRegionForView } from "./layout/regions";

export type AutomationViewAdderContext = {
  hasProject: boolean;
  hasFlow: boolean;
  hasTopLevelFlow: boolean;
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

const contextLabels: Record<keyof AutomationViewAdderContext, string> = {
  hasProject: "Open a project first",
  hasFlow: "Select a Flow or subflow first",
  hasTopLevelFlow: "Select a top-level Flow first",
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
    const rule = automationStudioViewDefinition(view.id);
    if (!rule?.addable || automationWorkspaceRegionForView(view.id) !== area) return [];
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
