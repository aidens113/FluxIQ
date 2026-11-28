// What happens after a round. There is deliberately no "failed" here: a task
// ends only on a judged result, a budget gone, or a person's Stop -- or on a
// request the provider refused, which no retry can get past (`./refused-request.ts`).

import type { JsonObject } from "../../../core/index.ts";

export type AutomationStudioAnswerFirstNext =
  | { kind: "achieved" }
  | { kind: "budget_out"; why: "purse" | "empty_balance" }
  | { kind: "stopped" }
  /** The model service is silent: wait, at no cost, and say so. */
  | { kind: "backoff"; waitMs: number; say: string }
  /**
   * The provider refused the request, and Core could not change it into one it takes: never waited on or asked again,
   * since the identical request would be refused identically. `why` is the refusal in t1093's words ("the model provider
   * refused the request: <its message>"), which the build's ending says once; nothing here says it a second time.
   */
  | { kind: "refused"; why: string }
  /** Any stall or limit: start a round again from the page as it stands. */
  | { kind: "fresh_round"; why: string; note: JsonObject };
