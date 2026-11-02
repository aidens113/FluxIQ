// Compatibility exports; the framework owns this implementation.
export {
  automationStudioNameEditDistance,
  automationStudioMatchName,
  normalizeAutomationStudioName,
  AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR,
  automationStudioNameSimilarity,
  automationStudioNameSynonymCredit,
  automationStudioNameTokenCredit,
  automationStudioNameTokenOverlap
} from "../../../../components/automation/name-match/index.ts";
export type {
  AutomationStudioNameCandidate,
  AutomationStudioNameMatch,
  AutomationStudioNameTokenOverlapResult,
  AutomationStudioNameValueShape
} from "../../../../components/automation/name-match/index.ts";
