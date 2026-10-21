// Barrel for the activity status: the one status a person reads while FluxIQ
// works (a headline naming the unit of work, the latest event in words under
// it, paced so neither flickers), the words each activity event is said in,
// and the readers of the closed fields an event carries. Pure apart from an
// injected clock, and browser-safe, so every client that shows the activity
// stream -- Core's panel chat and an importing repository's extension -- says
// the same thing at the same pace.
//
// The wire types the API is written in are re-exported here, so a client
// needs no dependency on `@fluxiq/contracts` to use it.
export type { ClientGatewayActivity, ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
export type { ActivityDisplay } from "./activity-display.ts";
export { CandidateTrial, type TrialState } from "./candidate-trial.ts";
export { systemActivityClock, type ActivityClock, type ActivityTimer } from "./clock.ts";
export { cutAtWord } from "./cut-at-word.ts";
export { declinedSubmission } from "./declined-submission.ts";
export { endingKindOf } from "./ending-kind.ts";
export { ACTIVITY_FAN_OUT_INTERVAL_MS, FanOutGate } from "./fan-out-gate.ts";
export { activityHeadline, type ActivityHeadlineSituation, type ActivityWaitReason } from "./headline.ts";
export { activityWithoutHeadline, isHeadlineEcho } from "./headline-echo.ts";
export type { ActivityHostWords } from "./host-words.ts";
export { ACTIVITY_HISTORY_LIMITS } from "./history-limits.ts";
export { isInternalStep } from "./internal-step.ts";
export { isModelThought } from "./model-thought.ts";
export { notTriedOutcome } from "./not-tried.ts";
export { ACTIVITY_DETAIL_INTERVAL_MS, ACTIVITY_HEADLINE_DWELL_MS, ActivityPacer, type ActivityPacerOptions } from "./pacer.ts";
export { activityAgent, projectCard, type ActivityAgent, type ActivityProjectCard } from "./project/index.ts";
export { RunRetry, type RetryState } from "./run-retry.ts";
export { ACTIVITY_PAGE_PREPARATION_WORDS, activitySaidOnce } from "./steady/index.ts";
export { stepRecovery, type ActivityStepRecovery } from "./step-recovery.ts";
export { stepSkip, type ActivityStepSkip } from "./step-skip.ts";
export { SupervisorEnding, type SupervisorEndingWords } from "./supervisor-ending.ts";
export { UnitHistory, type UnitHistoryLimits } from "./unit-history.ts";
export { UnitSituation, type UnitState } from "./unit-situation.ts";
export { longestWordCut } from "./word-cut.ts";
export { activityWording, type ActivityWording } from "./wording.ts";
