// The plan's hard rule as a table (answer-first plan, "Keep Going Until The
// Result"): given how a round ended, what comes next. Nothing but a judged
// result, a budget gone or a person's Stop ends a task, so this never returns a
// failure. Order matters:
//   1. a person's Stop               -> stopped
//   2. the result achieved           -> achieved
//   3. purse refusal / empty balance -> budget_out
//   4. the model service silent      -> backoff (costs nothing)
//   5. everything else, unknown errors and codes included -> fresh_round

import type { JsonObject } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_LOOP_FAILURE_REASONS } from "./loop-failure-reasons.ts";
import { automationStudioAnswerFirstBackoff } from "./backoff.ts";
import { automationStudioAnswerFirstThrownKind } from "./thrown-kind.ts";
import type { AutomationStudioAnswerFirstNext } from "./next-step.ts";
import type { AutomationStudioAnswerFirstRoundEnd } from "./round-end.ts";

const BALANCE_CODE = "llm.provider_balance_exhausted";
const REASONS: Readonly<Record<string, string>> = AUTOMATION_STUDIO_ANSWER_FIRST_LOOP_FAILURE_REASONS;

function freshRound(reason: string): AutomationStudioAnswerFirstNext {
  const why = `The round stopped because ${reason}; I am starting another from the page as it stands.`;
  const note: JsonObject = { why, carriedOver: ["page", "draft", "acts", "tried"] };
  return { kind: "fresh_round", why, note };
}

export function automationStudioAnswerFirstNext(input: {
  end: AutomationStudioAnswerFirstRoundEnd;
  aborted: boolean;
  purseRefused: boolean;
  achieved: boolean;
  backoffs: number;
}): AutomationStudioAnswerFirstNext {
  const { end } = input;
  if (input.aborted) return { kind: "stopped" };
  if (input.achieved) return { kind: "achieved" };
  if (input.purseRefused) return { kind: "budget_out", why: "purse" };
  if (end.kind === "thrown") {
    const kind = automationStudioAnswerFirstThrownKind(end.error);
    if (kind === "purse") return { kind: "budget_out", why: "purse" };
    if (kind === "empty_balance") return { kind: "budget_out", why: "empty_balance" };
    if (kind === "silent") return { kind: "backoff", ...automationStudioAnswerFirstBackoff(input.backoffs) };
    return freshRound("something unexpected went wrong");
  }
  const result = end.result;
  if (result.ok) return freshRound("it ended without a confirmed result");
  if (result.providerUnavailable?.codes.includes(BALANCE_CODE)) return { kind: "budget_out", why: "empty_balance" };
  if (result.code === "llm_evidence_loop.provider_unavailable") return { kind: "backoff", ...automationStudioAnswerFirstBackoff(input.backoffs) };
  return freshRound(Object.hasOwn(REASONS, result.code) ? REASONS[result.code]! : "it ended in a way I did not expect");
}
