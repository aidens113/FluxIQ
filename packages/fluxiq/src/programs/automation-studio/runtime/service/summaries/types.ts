import type { AutomationStudioInstructionSummary, AutomationStudioSubflowSummary } from "../indexes/index.ts";

// One page of Subflow summaries. It moved out of service.ts with the ports
// entry for listFlowSubflowSummaries; service.ts re-exports it unchanged.
export type AutomationStudioSubflowSummaryPage = {
  subflows: AutomationStudioSubflowSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type AutomationStudioInstructionSummaryPage = {
  instructions: AutomationStudioInstructionSummary[];
  total: number;
  limit: number;
  offset: number;
};
