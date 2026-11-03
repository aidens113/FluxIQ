import type { AutomationStudioProjectAgentRole, AutomationStudioProjectDecisionLogEntry, AutomationStudioProjectReceiptRef, AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../index.ts";
import type { AutomationStudioProjectBuildLastingAct } from "./lasting-act.ts";
import type { AutomationStudioProjectBuildToggle } from "./toggle.ts";
import type { AutomationStudioProjectBuildEnding } from "./ending.ts";

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
  /** The project's lasting-act ledger: one writer, every act of the build with the agent that made it and its lasting classes. */
  lastingActs: AutomationStudioProjectBuildLastingAct[];
  decisions: Array<{ recordedAt: number; entry: AutomationStudioProjectDecisionLogEntry }>;
  /**
   * Every press the domain answered as a toggle, as the build's record of them
   * held it (`flow-bootstrap/explored-toggles.ts`; t792): what a later step on
   * the same control was given `ensureState` from. Absent until the first.
   */
  toggles?: AutomationStudioProjectBuildToggle[];
  ending?: AutomationStudioProjectBuildEnding;
};
