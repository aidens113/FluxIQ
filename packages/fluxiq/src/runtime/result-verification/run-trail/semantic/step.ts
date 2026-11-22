import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioProjectJudgeEvidence } from "../../judge-evidence/index.ts";
import type { AutomationStudioResultTrailSemanticOptions } from "./options.ts";

/** Add one durable finding before any legacy bookkeeping screen; leave the private finding and framework facts intact. */
export function automationStudioResultTrailSemanticStep(step: AutomationStudioResultTrailStep, input: Parameters<AutomationStudioJudgeEvidenceProjector>[0], options: AutomationStudioResultTrailSemanticOptions, framework?: JsonObject): AutomationStudioResultTrailStep {
  const projected = automationStudioProjectJudgeEvidence(input, options.projectJudgeEvidence, options.deniedEvidenceKeys);
  return { ...step, ...(framework === undefined ? {} : { framework }), judgeEvidence: { version: 1, ...projected } };
}
