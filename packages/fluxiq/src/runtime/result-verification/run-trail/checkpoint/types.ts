import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import type { AutomationStudioJudgeEvidenceFinding } from "../../judge-evidence/finding.ts";

/** Private semantic journal; raw findings/asked payloads and functions never enter this checkpoint. */
export type AutomationStudioJudgeEvidenceCheckpoint = {
  version: 1;
  /** Core's logical-attempt snapshot sequence, incremented before any asynchronous save. */
  revision: number;
  trail: Array<Omit<AutomationStudioResultTrailStep, "found" | "asked">>;
  witnesses?: { before?: AutomationStudioJudgeEvidenceFinding; after?: AutomationStudioJudgeEvidenceFinding };
};
