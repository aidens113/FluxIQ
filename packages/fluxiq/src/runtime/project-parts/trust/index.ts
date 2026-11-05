// How far a part version has been proven, derived at read from the runs recorded
// for it and never stored.
export { deriveAutomationStudioPartTrust } from "./derive-trust.ts";
export { completeAutomationStudioPartCard } from "./complete-card.ts";
export { partTrustEvidenceFromJudgements as automationStudioPartTrustEvidenceFromJudgements, partTrustEvidenceFromRuns as automationStudioPartTrustEvidenceFromRuns } from "./evidence.ts";
export type { AutomationStudioPartTrustEvidence } from "./types.ts";
export { lastAutomationStudioPartVerdict } from "./last-verdict.ts";
