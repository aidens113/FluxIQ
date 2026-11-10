// What an attempt completes with, the one check that takes it (`./check.ts`), what a refusal says
// (`./refused-words.ts`) and what it shows of the result as it stands (`./result-holds.ts`).
export { AUTOMATION_STUDIO_ANSWER_FIRST_NOT_JUDGED_CODE, AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE, AutomationStudioAnswerFirstJudgeRefusedByPurse, automationStudioAnswerFirstCompletionCheck, type AutomationStudioAnswerFirstCompletionCheck, type AutomationStudioAnswerFirstCompletionState } from "./check.ts";
export { AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS } from "./refused-words.ts";
export { automationStudioAnswerFirstResultHolds } from "./result-holds.ts";
export { AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA } from "./schema.ts";
// A replay accepted on its own record when it ran as saved, and the judge asked when it deviated (task speed S9).
export type { AutomationStudioAnswerFirstReadShape, AutomationStudioAnswerFirstReplayRecord, AutomationStudioAnswerFirstReplayStep } from "./replay-record.ts";
export { AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS, automationStudioAnswerFirstReplayStands, type AutomationStudioAnswerFirstReplayDeviation } from "./replay-stands.ts";
export { automationStudioAnswerFirstReadShapeOf } from "./read-shape.ts";
export { automationStudioAnswerFirstReplayOf } from "./replay-of.ts";
export { AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS } from "./on-record.ts";
