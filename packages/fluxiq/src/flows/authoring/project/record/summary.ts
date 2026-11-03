import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectDecisionLogEntry, AutomationStudioProjectSubflowBrief } from "../index.ts";
import type { AutomationStudioProjectBuildEnding } from "./ending.ts";

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
