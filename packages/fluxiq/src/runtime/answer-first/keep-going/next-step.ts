// What happens after a round. There is deliberately no "failed" here: a task
// ends only on a judged result, a budget gone, or a person's Stop.

import type { JsonObject } from "../../../core/index.ts";

export type AutomationStudioAnswerFirstNext =
  | { kind: "achieved" }
  | { kind: "budget_out"; why: "purse" | "empty_balance" }
  | { kind: "stopped" }
  /** The model service is silent: wait, at no cost, and say so. */
  | { kind: "backoff"; waitMs: number; say: string }
  /** Any stall or limit: start a round again from the page as it stands. */
  | { kind: "fresh_round"; why: string; note: JsonObject };
