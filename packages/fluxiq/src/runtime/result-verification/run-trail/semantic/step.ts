import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioProjectJudgeEvidence } from "../../judge-evidence/project.ts";
import type { AutomationStudioResultTrailSemanticOptions } from "./options.ts";

/** Add one durable finding before any legacy bookkeeping screen; leave the private finding and framework facts intact. */
export function automationStudioResultTrailSemanticStep(step: AutomationStudioResultTrailStep, input: Parameters<AutomationStudioJudgeEvidenceProjector>[0], options: AutomationStudioResultTrailSemanticOptions, framework?: JsonObject): AutomationStudioResultTrailStep {
  if (!Object.hasOwn(options, "judgeEvidenceVersion")) return step;
  const projected = options.judgeEvidenceVersion === 1 ? automationStudioProjectJudgeEvidence(input, options.projectJudgeEvidence, options.deniedEvidenceKeys) : { missing: ["judge_evidence.version_invalid"], withheld: true };
  return { ...step, ...(framework === undefined ? {} : { framework }), judgeEvidence: { version: 1, ...projected } };
}
