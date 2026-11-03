import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import type { AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { automationStudioRequestUnstatedExclusions, type AutomationStudioRequestWording } from "../request-rows/index.ts";
import { automationStudioResultNamedStoredLabels } from "../standing-no-record/index.ts";

/**
 * The call of a split that said no, and the exclusions its advice adds that the
 * request never states; nothing without both. With Core's record, an exclusion
 * that says what a stored row the no's reading names is, is not one (header, t628).
 */
export function unstatedExclusion(
  first: AutomationStudioResultVerification,
  second: AutomationStudioResultVerification,
  wording: AutomationStudioRequestWording | undefined,
  record: AutomationStudioResultNoRecord | undefined
): { call: 1 | 2; exclusions: string[] } | undefined {
  if (!wording) return undefined;
  const call = first.verdict === "does_not_answer" ? 1 : second.verdict === "does_not_answer" ? 2 : undefined;
  if (!call) return undefined;
  const judgement = (call === 1 ? first : second).repair?.judgement;
  const exclusions = automationStudioRequestUnstatedExclusions(judgement?.advice, wording, record ? automationStudioResultNamedStoredLabels(judgement, record) : []);
  return exclusions.length ? { call, exclusions } : undefined;
}
