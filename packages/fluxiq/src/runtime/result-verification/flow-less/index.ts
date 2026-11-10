// The judge of an answer with no Flow behind it, and the digest a completion is
// compared by (plan D9; `./judge.ts` says what it reuses and why it asks once).
// `./judged-summary.ts`, `./question.ts` and, on a repeat the person asked for, `./asked-again.ts`
// are what it is shown; `./screened-words.ts` is the screen on a model's words, for whoever writes
// them on to a record.

export { AUTOMATION_STUDIO_FLOW_LESS_ASKED_AGAIN } from "./asked-again.ts";
export { automationStudioFlowLessJudge } from "./judge.ts";
export { automationStudioFlowLessJudgedSummary } from "./judged-summary.ts";
export type { AutomationStudioFlowLessReadLeftOut } from "./read-left-out.ts";
export { automationStudioFlowLessReadPagesShown } from "./read-pages-shown.ts";
export { AUTOMATION_STUDIO_FLOW_LESS_QUESTION } from "./question.ts";
export { automationStudioFlowLessScreenedWords } from "./screened-words.ts";
export { automationStudioFlowLessSummaryDigest } from "./summary-digest.ts";
export type { AutomationStudioFlowLessJudgeInput, AutomationStudioFlowLessJudgement, AutomationStudioFlowLessSummary } from "./types.ts";
