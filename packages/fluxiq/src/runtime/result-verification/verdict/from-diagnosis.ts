import type { AutomationStudioLlmDiagnosisFields } from "../../llm/index.ts";
import type { AutomationStudioResultVerdict } from "../contracts/index.ts";

/** The verdict a model's `answersRequest` field carries, with anything else read as `unsure`. */
export function automationStudioResultVerdictFromDiagnosis(diagnosis: AutomationStudioLlmDiagnosisFields | undefined): AutomationStudioResultVerdict {
  if (diagnosis?.answersRequest === "yes") return "answers";
  if (diagnosis?.answersRequest === "no") return "does_not_answer";
  return "unsure";
}
