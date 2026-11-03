import type { AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS } from "./kinds.ts";
import type { AutomationStudioFlowBootstrapInterface } from "../../plan/index.ts";
import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";
import type { AutomationStudioProjectReceiptRef } from "../index.ts";
import type { AutomationStudioProjectFailingTrial } from "./failing-trial.ts";
import type { AutomationStudioProjectCarriedProposal } from "./carried-proposal.ts";
import type { AutomationStudioProjectEarlierAttempt } from "./earlier-attempt.ts";

export type AutomationStudioProjectSubflowBrief = {
  briefId: string;
  kind: (typeof AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS)[number];
  planDigest: string;
  subflowKey: string;
  parts: string[];
  /** Absent only for a subflow the router runs, whose interface is the Flow's. */
  interface?: AutomationStudioFlowBootstrapInterface;
  entry: { caseId: string; predecessors: string[] };
  allowanceUsd: number;
  maxIterations: number;
  /**
   * The calls its allowance is carved with, its subflow trials' judges among
   * them (t570): Core's share of the build's calls, set as the brief is
   * dispatched. Absent on a brief recorded before Core sized calls.
   */
  maxCalls?: number;
  /** Core's, from the lasting acts its parts ask for (t570); never wider. */
  permittedActs: AutomationStudioActionConsequence[];
  recordingExcerpt?: string;
  /** Repair only: the trial the repair starts from. */
  failingReceipt?: AutomationStudioProjectReceiptRef;
  /** Repair only, beside its receipt: what that trial said, when Core held it as the brief was sent (header). */
  failingTrial?: AutomationStudioProjectFailingTrial;
  /** Build only: the done proposal an amendment that only added to this subflow carried for it (header), set by Core, never by the supervisor. */
  carriedFrom?: AutomationStudioProjectCarriedProposal;
  /** Build or repair: the earlier brief of this subflow whose builder the no-progress guard stopped (header), set by Core, never by the supervisor. */
  earlierAttempt?: AutomationStudioProjectEarlierAttempt;
};
