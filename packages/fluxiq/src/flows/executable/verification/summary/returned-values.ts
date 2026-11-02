/**
 * The single values a run's steps returned (`AutomationStudioRunResultSummary.returned`,
 * t757): each by the step that returned it, in run order, beside Core's
 * sentence for what they are. Read off a step's `outputs.value`, Core's port
 * for a node's single value, and screened as every run value is.
 */

export type ResultReturnedValues = {
  said: string;
  values: Array<{ nodeId: string; value: string | number | boolean }>;
};
