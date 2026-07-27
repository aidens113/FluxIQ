export type AutomationStudioPanel =
  | "tasks"
  | "routines"
  | "recordings"
  | "policies"
  | "interfaces"
  | "generation";

export type AutomationStudioViewState = {
  activePanel: AutomationStudioPanel;
  selectedTaskId?: string;
  selectedRecordingId?: string;
  selectedPolicyId?: string;
};
