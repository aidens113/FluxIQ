// Offline trials (traces and offline trials, P4; subflows, t769 P6): the
// candidate trial runner, and the subflow partial trial runner, with a
// recorded trace as its environment, each answering the trial's own outcome
// beside the trial evidence result (U5) it rests on.
export type * from "./contracts.ts";
export { AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS } from "./reader-contracts.ts";
export { automationStudioOfflineTrialEvidenceResult } from "./evidence-result.ts";
export { runAutomationStudioOfflineCandidateTrial } from "./run.ts";
export { runAutomationStudioOfflineSubflowTrial } from "./subflow-run.ts";
