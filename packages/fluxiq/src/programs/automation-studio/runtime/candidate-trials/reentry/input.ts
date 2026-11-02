import type { AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop/index.ts";
import type { AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";

export interface CandidateTrialReentryInput {
  readonly gate: object;
  readonly tool: AutomationStudioLlmEvidenceTool;
  readonly maxTrials: number;
  latest(): AutomationStudioFlowCandidate | undefined;
  available(): { revision: number; digest: string; trials: number } | { why: string };
  completedOrdinal(): number;
}
