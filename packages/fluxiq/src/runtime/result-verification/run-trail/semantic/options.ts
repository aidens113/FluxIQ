import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";

/** Present even for an old binding with no projector: absence must not enable a raw-evidence fallback. */
export type AutomationStudioResultTrailSemanticOptions = {
  projectJudgeEvidence?: AutomationStudioJudgeEvidenceProjector | undefined;
  deniedEvidenceKeys: readonly string[] | undefined;
};
