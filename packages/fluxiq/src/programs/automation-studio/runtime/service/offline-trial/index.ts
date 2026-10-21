// Offline candidate trials (traces and offline trials, P4): the candidate
// trial runner with a recorded trace as its environment, answering the trial's
// own outcome beside the trial evidence result (U5) it rests on.
export type * from "./contracts.ts";
export { AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS } from "./reader-contracts.ts";
export { automationStudioOfflineTrialEvidenceResult } from "./evidence-result.ts";
export { runAutomationStudioOfflineCandidateTrial } from "./run.ts";
