import type { AutomationStudioChangeProposalSummary } from "../indexes/index.ts";

// What a listing of Flow change proposals returns, and what a reviewer asks of
// a Flow adaptation.

export type AutomationStudioChangeProposalSummaryPage = {
  changeProposals: AutomationStudioChangeProposalSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type ReviewFlowAdaptationInput = {
  projectId: string;
  flowId: string;
  adaptationId: string;
  action: "approve" | "reject" | "apply" | "disable" | "revert" | "supersede" | "request_validation" | "switch_manual";
  actorId?: string;
  reason?: string;
  supersededByAdaptationId?: string;
};
