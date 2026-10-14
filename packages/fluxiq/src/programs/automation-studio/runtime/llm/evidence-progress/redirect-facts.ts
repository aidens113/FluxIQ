import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import { automationStudioLlmEvidenceLatestCandidateReceipt } from "../candidate-receipt/index.ts";
import type { AutomationStudioLlmEvidenceLoopAnswerability } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../loop-configuration.ts";
import type { AutomationStudioLlmEvidenceStallRedirectInput } from "./stall-redirect.ts";

/** Snapshot of the authoring facts the no-progress redirect needs; candidate receipts and legacy drafts keep separate ownership. */
export function automationStudioLlmEvidenceRedirectFacts(input: {
  config: AutomationStudioLlmEvidenceLoopInput;
  steps: readonly AutomationStudioFlowDraftStep[];
  evidence: readonly AutomationStudioLlmEvidenceEntry[];
  completionAttempts: number;
  canComplete: boolean;
  answerability: AutomationStudioLlmEvidenceLoopAnswerability | undefined;
  looksWithdrawn: boolean;
}): Omit<AutomationStudioLlmEvidenceStallRedirectInput, "stepsWithoutProgress" | "maxStepsWithoutProgress" | "repeatingToolIds" | "lastIssueCodes"> {
  const { config, steps } = input;
  return {
    proposableSteps: steps.filter((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)).length,
    completionAttempts: input.completionAttempts,
    canComplete: input.canComplete,
    ...(config.discoveryOnly ? { discoveryOnly: true, candidate: automationStudioLlmEvidenceLatestCandidateReceipt(input.evidence, config.finishingTools?.submit), finishing: config.finishingTools } : {}),
    answerability: input.answerability,
    looksWithdrawn: input.looksWithdrawn,
    actsMissing: config.draft ? config.draft.actsMissing?.(steps) : undefined,
    acts: config.draft ? config.draft.acts?.(steps) : undefined
  };
}
