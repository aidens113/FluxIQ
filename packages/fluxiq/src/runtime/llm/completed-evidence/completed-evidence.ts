export const AUTOMATION_STUDIO_COMPLETED_LLM_EVIDENCE_PERSISTENCE_OUTCOMES = [
  "stored",
  "disabled",
  "unavailable",
  "rejected",
  "invalid"
] as const;

export type AutomationStudioCompletedLlmEvidencePersistenceOutcome =
  (typeof AUTOMATION_STUDIO_COMPLETED_LLM_EVIDENCE_PERSISTENCE_OUTCOMES)[number];

export type AutomationStudioCompletedLlmEvidencePersistenceInput = {
  projectId: string;
  flowId: string;
  subflowId?: string;
  evidenceKind: "exploration" | "runtime_failure" | "adaptation_validation";
  outcome: "succeeded" | "failed" | "rejected" | "reverted";
  reviewerState: "unreviewed" | "approved" | "rejected" | "reverted";
  validationState: "unknown" | "validated" | "applied";
  sourceRunIds: string[];
  sourceAdaptationIds: string[];
  completedAt: number;
  actions?: Array<{
    definitionId: string;
    status: "succeeded" | "failed";
    route?: "success" | "failed";
  }>;
};

export type AutomationStudioCompletedLlmEvidencePersistence = (
  input: AutomationStudioCompletedLlmEvidencePersistenceInput
) => Promise<AutomationStudioCompletedLlmEvidencePersistenceOutcome>;

/** Persistence is supplemental to the completed generation/run. It is always
 * fail-closed, but a disabled or unavailable protected store cannot turn an
 * already completed primary operation into a failure. */
export async function persistAutomationStudioCompletedLlmEvidence(
  persist: AutomationStudioCompletedLlmEvidencePersistence | undefined,
  input: AutomationStudioCompletedLlmEvidencePersistenceInput
): Promise<AutomationStudioCompletedLlmEvidencePersistenceOutcome> {
  if (!persist) return "unavailable";
  try {
    const outcome = await persist(input);
    return (AUTOMATION_STUDIO_COMPLETED_LLM_EVIDENCE_PERSISTENCE_OUTCOMES as readonly string[]).includes(outcome)
      ? outcome
      : "rejected";
  } catch {
    return "rejected";
  }
}
