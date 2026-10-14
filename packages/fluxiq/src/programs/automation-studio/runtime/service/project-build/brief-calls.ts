import type { AutomationStudioProjectSubflowBrief } from "../../project-agents/index.ts";

// The call cap of a brief's allowance (unit A5c; A5b report, open question 2).
// The dispatcher's default is the brief's `maxIterations`, but the allowance's
// purse scope holds the brief's subflow trials' judge calls too, so a builder
// that tests would get fewer decisions than its brief gave it. A decision makes
// at most one trial, and a trial's judge asks at most twice (a first answer and
// its confirmation, `result-verification/verify.ts`), so a build or repair
// brief is capped at three calls per decision; a reset brief runs no trial.
// Its money stays the brief's `allowanceUsd`, which the supervisor carves.

/** Judge calls one subflow trial makes at most. */
const JUDGE_CALLS_PER_TRIAL = 2;

export function automationStudioProjectBuildBriefCalls(brief: AutomationStudioProjectSubflowBrief): number {
  return brief.kind === "reset" ? brief.maxIterations : brief.maxIterations * (1 + JUDGE_CALLS_PER_TRIAL);
}
