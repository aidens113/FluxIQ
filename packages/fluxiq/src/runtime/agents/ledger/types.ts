import type { AutomationStudioLlmUsageSummary } from "../../models/contracts/index.ts";
import type { ModelRunCallDescription, ModelRunCallOutcome } from "./record.ts";

export type ModelRunBudgetAllowance = "run" | "exploration";

export type ModelRunBudgetLimits = {
  /**
   * The runaway backstop on provider calls. Absent means
   * `AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP`. Every call counts against it,
   * whatever its label.
   */
  maxCallsPerRun?: number;
  maxTotalTokensPerRun: number;
  maxOutputTokensPerRun: number;
  /** The run's cost total, held against every reservation. Absent means the run cost ceiling, `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD` ($0.10 by default). */
  maxEstimatedCostUsdPerRun?: number;
};

export type ModelRunBudgetReservationInput = {
  runId: string;
  requestId: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  /** What this call reserves against the run's total before it knows what it spent. Absent means the whole ceiling. */
  maxEstimatedCostUsd?: number;
  /** What kind of call this is, for the receipt. Absent means an ordinary run call. */
  allowance?: ModelRunBudgetAllowance;
  /**
   * What the call is, for its own line on the receipt. A hold that no call
   * ever spends has none; a call without one is still itemized, with its
   * description left `null`.
   */
  call?: ModelRunCallDescription;
};

export type ModelRunBudgetDiagnostic = {
  code: "llm_budget.run_call_limit" | "llm_budget.run_total_limit" | "llm_budget.run_output_limit" | "llm_budget.run_cost_limit" | "llm_budget.duplicate_request" | "llm_budget.invalid_reservation";
  message: string;
};

export type ModelRunBudgetLease = {
  requestId: string;
  /**
   * Count the call and charge it. `usage` is the provider's own report, as it
   * gave it; the ledger decides which of its figures it can charge. `outcome`
   * is how the call ended, for the call's line on the receipt.
   */
  complete(usage?: AutomationStudioLlmUsageSummary, outcome?: ModelRunCallOutcome): void;
  /**
   * Give the reservation back unspent: nothing is charged and no call is
   * counted. For a hold no call ever used -- the recovery sets one aside for its
   * patch while it explores, so the exploration cannot spend the patch's call,
   * tokens or money. A lease settles once, by whichever of the two comes first.
   */
  release(): void;
};

export type ModelRunBudgetReservation =
  | { ok: true; lease: ModelRunBudgetLease }
  | { ok: false; diagnostic: ModelRunBudgetDiagnostic };
