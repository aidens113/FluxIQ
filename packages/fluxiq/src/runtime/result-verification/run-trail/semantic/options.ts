import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";

/** Present even for an old binding with no projector: absence must not enable a raw-evidence fallback. */
export type AutomationStudioResultTrailSemanticOptions = {
  projectJudgeEvidence?: AutomationStudioJudgeEvidenceProjector | undefined;
  judgeEvidenceVersion?: 1 | undefined;
  deniedEvidenceKeys: readonly string[] | undefined;
  /** Known Core composition source for old summaries; no domain key guessing. */
  legacySource?: "call" | "flow-attempt" | "build-observation" | "legacy" | undefined;
  /** A persisted semantic summary contains shown findings, never new domain inputs. */
  alreadyProjected?: boolean | undefined;
  invalidFormat?: boolean | undefined;
};
