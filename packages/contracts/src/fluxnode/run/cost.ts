// What a run has spent: model calls, tokens and billed dollars. A replay that passes
// its check makes no call and costs $0 (plan, N4).

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";

/** `calls` model calls, `tokens` tokens in and out together, `usd` billed dollars. */
export const fluxNodeCostSchema = z
  .object({
    calls: fluxNodeFieldSchemas.count,
    tokens: fluxNodeFieldSchemas.count,
    usd: fluxNodeFieldSchemas.usd
  })
  .strict();

export type FluxNodeCost = z.infer<typeof fluxNodeCostSchema>;
