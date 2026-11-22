import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import type { AutomationStudioJudgeEvidenceFinding } from "../../judge-evidence/finding.ts";

/** Private semantic journal; raw findings/asked payloads and functions never enter this checkpoint. */
export type AutomationStudioJudgeEvidenceCheckpoint = {
  version: 1;
  trail: Array<Omit<AutomationStudioResultTrailStep, "found" | "asked">>;
  witnesses?: { before?: AutomationStudioJudgeEvidenceFinding; after?: AutomationStudioJudgeEvidenceFinding };
};
