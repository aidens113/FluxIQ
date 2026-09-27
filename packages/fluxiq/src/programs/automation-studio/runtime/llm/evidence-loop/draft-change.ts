/** Stable build-local identities and counts for one draft amendment decision. */
export type AutomationStudioLlmEvidenceLoopDraftChange = {
  targetedStepIds: string[];
  appliedCount: number;
  refusedCount: number;
  keptStepCount: number;
  rerunStepId?: string;
};
