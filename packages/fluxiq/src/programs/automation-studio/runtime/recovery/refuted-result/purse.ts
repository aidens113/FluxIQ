// The one purse a refuted result's whole repair spends from.
//
// **Why one purse, not one per part.** Each part of a repair was held to the
// run cost ceiling, then $0.25, on its own: the re-author build, the build again
// after a failure that may pass, and the patch ladder the repair falls back to.
// So one repair could spend about $0.75, and a run refuted again after its
// re-run could start the whole sequence over. The user's rule is that a build,
// and its repair, each spend at most the run cost ceiling in total
// (`AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD`, $0.10 by default). So the repair of one run
// is one total: the ceiling, lowered by the Flow's own setting and never raised
// by it. Each part is handed what is left of that total once the parts before
// it have been charged what they reported spending, and a part with nothing
// left makes no model call and says the cost bound is why.
//
// **"Nothing left" means not enough for one more call.** Inside a part, what
// is left is held only from what each call reports once it has been made: the
// build's loop always allows its first decision, having nothing to average
// (`llm/loop-budget.ts`), and the recovery's ledger reserves a small share of
// its total per call and charges what the call actually cost. So a part handed
// a sliver would still spend a whole call past the total. Across parts there
// is something to average, so a later part starts only when what is left
// covers one more call at what the repair's calls have cost so far -- the rule
// the build's loop applies between its own decisions. The first part always
// starts.
//
// **Where it lives.** On the run's own re-author marker. The passes of one
// repair -- refuted, repaired, re-run, refuted again -- share nothing but the
// run's record (`repair.ts`), so the purse rides there, and the next pass opens
// it from what the last one wrote. It is a number on a record, not a ledger:
// what bounds each call inside a part is still that part's own ledger or loop
// budget, handed the purse's remainder as its total.
//
// **What it is charged.** What each part reported: a build's accounting, and a
// recovery's `llmGate.costAccounting`. A part that reached the provider and
// reported no cost cannot be charged; the purse counts it as `unreportedParts`
// rather than pretending it was free.
//
// **What it does not cover.** The result check's judgement of the run and of
// each re-run. The check is not part of the repair: it runs on every checked
// run, repair or none, and is paid and capped by its own authorization
// (`result-check-authorization/`).

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { automationStudioLlmRunCostCeilingUsd, type AutomationStudioLlmRunBudgetDiagnostic } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY } from "./reauthor.ts";

/**
 * The code a part of the repair is recorded under when the purse had nothing
 * left for it: the run ledger's own code for a total that cannot take another
 * call, so a reader keys on one code for "the money ran out" wherever it ran out.
 */
export const AUTOMATION_STUDIO_RESULT_REPAIR_COST_BOUND_CODE: Extract<AutomationStudioLlmRunBudgetDiagnostic["code"], "llm_budget.run_cost_limit"> = "llm_budget.run_cost_limit";

/** A part of the repair the purse can refuse. */
export type AutomationStudioResultRepairPart = "reauthor" | "patch_ladder";

/** The repair's purse, as the run records it. */
export type AutomationStudioResultRepairPurse = {
  /** The whole repair's total: the run cost ceiling, lowered by the Flow's own setting. */
  limitUsd: number;
  /** What every part of this run's repair reported spending, every pass included. */
  spentUsd: number;
  /** Parts that reached the provider and reported no cost, which the purse could not charge. */
  unreportedParts: number;
  /** The model calls of the parts that said how many they made, and what those parts cost: what one more call is averaged from. */
  averagedCalls: number;
  averagedUsd: number;
  /** Parts not run because nothing was left, in the order they were refused. */
  refusedParts: AutomationStudioResultRepairPart[];
};

/**
 * The purse this pass of the repair spends from: the run's own, opened where an
 * earlier pass left it, or a new one. `flowMaxCostUsd` is the Flow's configured
 * `maxEstimatedCostUsdPerRun`; it lowers the total and never raises it.
 */
export function automationStudioResultRepairPurse(detail: AutomationStudioFlowRunDetail, flowMaxCostUsd?: unknown): AutomationStudioResultRepairPurse {
  const recorded = recordedPurse(detail);
  const spentUsd = typeof recorded?.spentUsd === "number" && Number.isFinite(recorded.spentUsd) && recorded.spentUsd > 0 ? recorded.spentUsd : 0;
  const unreportedParts = typeof recorded?.unreportedParts === "number" && Number.isSafeInteger(recorded.unreportedParts) && recorded.unreportedParts > 0 ? recorded.unreportedParts : 0;
  const averagedCalls = typeof recorded?.averagedCalls === "number" && Number.isSafeInteger(recorded.averagedCalls) && recorded.averagedCalls > 0 ? recorded.averagedCalls : 0;
  const averagedUsd = averagedCalls && typeof recorded?.averagedUsd === "number" && Number.isFinite(recorded.averagedUsd) && recorded.averagedUsd > 0 ? recorded.averagedUsd : 0;
  const refusedParts = Array.isArray(recorded?.refusedParts) ? recorded.refusedParts.filter((part): part is AutomationStudioResultRepairPart => part === "reauthor" || part === "patch_ladder") : [];
  return { limitUsd: automationStudioLlmRunCostCeilingUsd(flowMaxCostUsd), spentUsd, unreportedParts, averagedCalls, averagedUsd, refusedParts };
}

/** What the next part may spend: the total less everything charged, never below zero. */
export function automationStudioResultRepairPurseLeftUsd(purse: AutomationStudioResultRepairPurse): number {
  return Math.max(0, roundUsd(purse.limitUsd - purse.spentUsd));
}

/**
 * Whether the next part may start: something is left, and -- once any part has
 * said how many calls it made -- enough for one more call at their average.
 */
export function automationStudioResultRepairPurseAllowsPart(purse: AutomationStudioResultRepairPurse): boolean {
  const left = automationStudioResultRepairPurseLeftUsd(purse);
  if (left <= 0) return false;
  return purse.averagedCalls === 0 || left >= roundUsd(purse.averagedUsd / purse.averagedCalls);
}

/**
 * The purse after one part: charged what it reported, or counted as unreported
 * when it reached the provider and reported nothing. `calls` is how many model
 * calls the part says it made, where it says.
 */
export function automationStudioResultRepairPurseCharged(
  purse: AutomationStudioResultRepairPurse,
  part: { costUsd?: unknown; calls?: unknown; reachedProvider: boolean }
): AutomationStudioResultRepairPurse {
  const cost = typeof part.costUsd === "number" && Number.isFinite(part.costUsd) && part.costUsd >= 0 ? part.costUsd : undefined;
  if (cost === undefined) return part.reachedProvider ? { ...purse, unreportedParts: purse.unreportedParts + 1 } : purse;
  const calls = typeof part.calls === "number" && Number.isSafeInteger(part.calls) && part.calls > 0 ? part.calls : 0;
  return {
    ...purse,
    spentUsd: roundUsd(purse.spentUsd + cost),
    ...(calls ? { averagedCalls: purse.averagedCalls + calls, averagedUsd: roundUsd(purse.averagedUsd + cost) } : {})
  };
}

/** The purse after a part it had nothing left for. */
export function automationStudioResultRepairPurseRefused(purse: AutomationStudioResultRepairPurse, part: AutomationStudioResultRepairPart): AutomationStudioResultRepairPurse {
  return { ...purse, refusedParts: [...purse.refusedParts, part] };
}

/** The run, with the purse as it now stands on its re-author marker, where the next pass opens it. */
export function automationStudioResultRepairWithPurse(detail: AutomationStudioFlowRunDetail, purse: AutomationStudioResultRepairPurse): AutomationStudioFlowRunDetail {
  const marker = reauthorMarker(detail) ?? {};
  const recorded: JsonObject = {
    limitUsd: purse.limitUsd,
    spentUsd: purse.spentUsd,
    leftUsd: automationStudioResultRepairPurseLeftUsd(purse),
    ...(purse.unreportedParts ? { unreportedParts: purse.unreportedParts } : {}),
    ...(purse.averagedCalls ? { averagedCalls: purse.averagedCalls, averagedUsd: purse.averagedUsd } : {}),
    ...(purse.refusedParts.length ? { refusedParts: [...purse.refusedParts], bound: "cost" } : {})
  };
  return {
    ...detail,
    metadata: {
      ...(detail.metadata ?? {}),
      [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: { ...marker, purse: recorded }
    }
  };
}

/** Rounded to the billionth, as the run ledger rounds its running total, so $0.10 less $0.07 is $0.03. */
function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function reauthorMarker(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  const marker = detail.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY];
  return marker && typeof marker === "object" && !Array.isArray(marker) ? marker as JsonObject : undefined;
}

function recordedPurse(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  const purse = reauthorMarker(detail)?.purse;
  return purse && typeof purse === "object" && !Array.isArray(purse) ? purse as JsonObject : undefined;
}
