// The most one run may spend on the model: $0.10 (the user's rule, 2026-10-01; was $0.25).
//
// This is a plain configured limit, not a grant. It is the default total of a
// build, of a build that re-authors a Flow whose result was refuted, and of a
// run's recovery, and every one of them is held to it from what each decision
// reports having cost (`../loop-budget.ts` for a build, `../run-budget.ts` for
// a recovery).
//
// A total used to come from wherever was nearest: the Flow's configured
// `maxEstimatedCostUsdPerRun` when set -- $1 as the web app saves it -- or else
// the resolver's default of $2, and the Flow's figure won even when it was the
// higher of the two. A limit that anything upstream can raise is not a limit.
// So the ceiling is fixed here, and what a Flow, a resolver or an authorization
// says can only lower it.

import { resolveAutomationStudioLlmRunCostCeilingUsd } from "../../../model/run-cost-ceiling/index.ts";

/**
 * The most one run -- a build, or a recovery -- may be estimated to spend:
 * FLUXIQ_LLM_RUN_COST_CEILING_USD (the developer and Lab knob, default $0.10),
 * read once when Core loads, so an invalid value stops Core at start.
 */
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD: number = resolveAutomationStudioLlmRunCostCeilingUsd();

/**
 * A run's total: the ceiling, lowered by each limit given that is a positive
 * finite number, and never raised by any. A limit that is absent, zero,
 * negative or not a number is ignored rather than trusted.
 */
export function automationStudioLlmRunCostCeilingUsd(...limits: readonly unknown[]): number {
  return Math.min(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, ...limits.filter((limit): limit is number => typeof limit === "number" && Number.isFinite(limit) && limit > 0));
}
