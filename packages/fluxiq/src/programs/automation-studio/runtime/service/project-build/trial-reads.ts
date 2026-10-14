import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/index.ts";
import type { AutomationStudioCandidateTrialPorts } from "../candidate-trial/index.ts";
import { automationStudioRunEndViewReader } from "../end-view/index.ts";

// What every trial of a build reads from the bound domain beside the run
// itself -- the page the run ended on, the handles of the ways out it pressed,
// the evidence keys it never shows -- for the whole candidate's trials and a
// project build's subflow trials alike (unit A5c).

export type AutomationStudioProjectBuildTrialReads = Pick<AutomationStudioCandidateTrialPorts, "readEndView" | "clearedControlHandles" | "deniedEvidenceKeys">;

export function automationStudioProjectBuildTrialReads(binding: AutomationStudioLlmEvidenceRuntimeBinding, projectId: string, flowId: string): AutomationStudioProjectBuildTrialReads {
  return {
    readEndView: ({ runId }) => automationStudioRunEndViewReader(binding)?.({ projectId, runId, flowId }) ?? Promise.resolve(undefined),
    clearedControlHandles: (wayOuts) => binding.clearedControlHandles?.({ projectId, flowId, wayOuts }) ?? Promise.resolve({}),
    deniedEvidenceKeys: binding.deniedEvidenceKeys
  };
}
