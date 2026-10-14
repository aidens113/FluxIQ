import { AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES, type AutomationStudioLlmBuildPurseJudging } from "../../llm/build-purse/index.ts";

// What the project supervisor keeps back of the Flow's purse (plan:
// Invariants, `Allowance`): the judged whole run, and one repair round, sized
// at the judge's own reserve pricing (`llm/build-purse/build-call-reserves.ts`)
// and held by the purse's judging reserve, which no allowance can be carved
// from (`purse.allocatableUsd`, `allowance`).
//
// - **The judged whole run**: a first answer and its confirmation
//   (`result-verification/verify.ts`), two judge calls.
// - **One repair round**: the repaired whole Flow judged again, two more. The
//   round's repair brief is not in it: its decisions and its own subflow
//   trial's judges run under that brief's allowance, carved like any brief's
//   from what is left (`project-agents/dispatch/run-brief.ts`), and charged
//   there. What no allowance can pay for is the judging of the whole Flow
//   after the repair, and that is what the reserve keeps for the round.
//
// The purse holds each judge call of the reserve at the largest judge call
// priced so far, or at `unpriced` before any has been, so the reserve grows
// with the judge calls this build actually makes. Judges draw on it; every
// other call -- each brief's allowance among them -- must leave it.

// **And the calls of the build's own finishing (t570).** Builders' call shares
// never take what the build needs after them: the supervisor's assembly, the
// dispatch of the reset before the whole test, the test and the completion,
// and the reset brief's own decisions, which only a reset brief is given
// (`llm/build-purse/purse.ts`, `keepBackCallsFromAllowances`). On A8 round 1
// (`run-mv7vl89u-917d62a6`) builders spent the build's 64 calls and nothing was
// left to assemble or test with.

/** The supervisor's own decisions after the last builder: assemble, dispatch the reset, test, complete. */
const SUPERVISOR_FINISHING_CALLS = 4;
/** A reset brief's decisions: look, undo the build's acts, and complete. */
const RESET_CALLS = 6;

/** The calls kept back from every builder's share for the build's own finishing. */
export const AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS: Readonly<{ supervisorCalls: number; resetCalls: number }> = Object.freeze({ supervisorCalls: SUPERVISOR_FINISHING_CALLS, resetCalls: RESET_CALLS });

/** Judge calls one judged whole run takes at most. */
const JUDGING_CALLS = 2;
/** Judge calls one repair round's judged whole run takes at most. */
const REPAIR_ROUND_JUDGING_CALLS = 2;

export const AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE: Readonly<AutomationStudioLlmBuildPurseJudging> = Object.freeze({
  calls: JUDGING_CALLS + REPAIR_ROUND_JUDGING_CALLS,
  unpriced: Object.freeze({ inputTokens: AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeInputTokens, outputTokens: AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeReplyTokens })
});
