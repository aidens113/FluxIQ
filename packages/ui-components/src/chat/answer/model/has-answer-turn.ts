// Whether an outcome is an answer turn at all: not while it is still working, and not an
// ended attempt that holds no result yet.

import type { ChatTaskOutcome } from "../../ports/index.ts";

/** True when `outcome` has an answer turn to show. */
export function hasAnswerTurn(outcome: ChatTaskOutcome): boolean {
  const { status } = outcome.attempt;
  if (status === "working") return false;
  return status !== "achieved" || outcome.result !== undefined;
}
