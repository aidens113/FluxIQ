import type { AutomationStudioProjectSubflowBrief } from "../../project-agents/index.ts";

// The call cap of a brief's allowance (unit A5c; A5b report, open question 2).
// The dispatcher's default is the brief's `maxIterations`, but the allowance's
// purse scope holds the brief's subflow trials' judge calls too, so a builder
// that tests would get fewer decisions than its brief gave it. A decision makes
// at most one trial, and a trial's judge asks at most twice (a first answer and
// its confirmation, `result-verification/verify.ts`), so a build or repair
// brief is capped at three calls per decision; a reset brief runs no trial.
// Its money stays the brief's `allowanceUsd`, which the supervisor carves.
//
// **A brief Core sized carries its share of the build's calls (t570).** The
// supervisor's dispatch splits the calls the purse can still carve over the
// briefs that need them (`project-agents/supervisor/brief-sizing.ts`) and
// writes each brief's `maxCalls`; that is its cap, carved from the purse's
// calls as its dollars are. Three calls a turn is only for a brief that
// carries no share, recorded before Core sized calls or made where the purse
// caps none.

/** Judge calls one subflow trial makes at most. */
const JUDGE_CALLS_PER_TRIAL = 2;

export function automationStudioProjectBuildBriefCalls(brief: AutomationStudioProjectSubflowBrief): number {
  if (brief.maxCalls !== undefined) return brief.maxCalls;
  return brief.kind === "reset" ? brief.maxIterations : brief.maxIterations * (1 + JUDGE_CALLS_PER_TRIAL);
}
