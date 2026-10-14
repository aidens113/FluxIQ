import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type {
  AutomationStudioProjectAgentRole,
  AutomationStudioProjectBuilderReturn,
  AutomationStudioProjectDecisionLogEntry,
  AutomationStudioProjectReceiptRef,
  AutomationStudioProjectStructurePlan,
  AutomationStudioProjectSubflowBrief,
  AutomationStudioProjectTaskSpec
} from "../contracts/index.ts";

// The build record: the product's working document for one project build,
// persisted under the Flow's directory as the build proceeds.
//
// The supervisor owns one main file. Each brief's return is its own file, as
// each worker here writes its own report, so builders running at the same time
// never write the same file. Receipts stay with their candidate owner; the
// record holds references.

/** Which build a call is about. */
export type AutomationStudioProjectBuildRef = { projectId: string; flowId: string; buildId: string };

export const AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS = Object.freeze(["promoted", "partial", "blocked", "cancelled"] as const);

export type AutomationStudioProjectBuildEnding = {
  outcome: (typeof AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS)[number];
  reason: string;
  at: number;
};

/** The supervisor's main file. Every list is in the order it was written. */
export type AutomationStudioProjectBuildRecord = {
  kind: "project_build_record";
  schemaVersion: 1;
  buildId: string;
  projectId: string;
  flowId: string;
  instructionDigest: string;
  sourceIds: string[];
  createdAt: number;
  updatedAt: number;
  taskSpecs: Array<{ revision: number; recordedAt: number; taskSpec: AutomationStudioProjectTaskSpec }>;
  plans: Array<{ revision: number; recordedAt: number; plan: AutomationStudioProjectStructurePlan }>;
  briefs: Array<{ recordedAt: number; brief: AutomationStudioProjectSubflowBrief }>;
  /** Receipts the supervisor's own whole-candidate trials produced; builders' trials are in their returns. */
  receipts: Array<{ recordedAt: number; briefId?: string; receipt: AutomationStudioProjectReceiptRef }>;
  allowances: Array<{ recordedAt: number; role: AutomationStudioProjectAgentRole; briefId?: string; usd: number }>;
  /** The project's lasting-act ledger: one writer, every entry attributed to the brief that acted. */
  lastingActs: Array<{ recordedAt: number; briefId: string; consequence: AutomationStudioActionConsequence; description: string }>;
  decisions: Array<{ recordedAt: number; entry: AutomationStudioProjectDecisionLogEntry }>;
  ending?: AutomationStudioProjectBuildEnding;
};

/** One brief's return file. Written once. */
export type AutomationStudioProjectBuildReturnRecord = {
  kind: "project_builder_return";
  schemaVersion: 1;
  buildId: string;
  briefId: string;
  recordedAt: number;
  builderReturn: AutomationStudioProjectBuilderReturn;
};

/** The main file with every return written so far, as read back. */
export type AutomationStudioProjectBuildRecordView = {
  record: AutomationStudioProjectBuildRecord;
  returns: AutomationStudioProjectBuildReturnRecord[];
};

/** What a later supervisor invocation reads first, as an agent here reads `Current State`. */
export type AutomationStudioProjectBuildSummary = {
  buildId: string;
  instructionDigest: string;
  taskSpec?: { revision: number; digest: string; parts: number };
  plan?: { revision: number; digest: string; subflows: string[] };
  briefs: Array<{
    briefId: string;
    kind: AutomationStudioProjectSubflowBrief["kind"];
    subflowKey: string;
    /** Whether the brief was written against the latest structure plan. */
    current: boolean;
    returned?: { outcome: AutomationStudioProjectBuilderReturn["outcome"]; reason: string; spentUsd: number };
  }>;
  spentUsd: number;
  lastingActs: number;
  lastDecision?: AutomationStudioProjectDecisionLogEntry;
  ending?: AutomationStudioProjectBuildEnding;
};
