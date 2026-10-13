import type { AutomationStudioResultVerification } from "../contracts.ts";
import { screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** Correct only a deficient explanation, using the same screened evidence and existing ask allowance. */
export function automationStudioResultExclusionEvidenceRecheck(verification: AutomationStudioResultVerification, deniedKeys: readonly string[] | undefined): string | undefined {
  if (!verification.exclusionEvidenceMissing?.length || deniedKeys === undefined) return undefined;
  const recheck = [
    "Your affirmative judgement lacked required exclusion evidence. Recheck the same request and result; do not change the Flow or invent an exclusion. For every row named below, use its full displayed name or exact distinguishing identifier in a sentence that also quotes in double quotes the request's own words excluding that row. Search or navigation words alone exclude nothing. If the request does not justify the exclusion, answer no; if evidence is insufficient, answer unknown.",
    ...verification.exclusionEvidenceMissing
  ].join("\n");
  const screened = screenAutomationStudioLlmEvidence({ recheck }, deniedKeys);
  return screened.deniedKey || screened.secretShaped ? undefined : recheck;
}
