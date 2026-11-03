import type { AutomationStudioLlmUsageSummary } from "../../models/contracts/index.ts";
import type { ModelRunBudgetAllowance } from "./types.ts";
import type { ModelReceiptPolicy } from "./policy.ts";

/** What a call is, known before it is sent. */
export type ModelRunCallDescription = {
  taskKind: string;
  /** The loop stage the call was made in. Absent for a call outside the protocol. */
  stage?: string;
  promptVersion: string;
  provider: string;
  model: string;
};

/** How a call ended, known once its answer was checked. */
export type ModelRunCallOutcome = {
  validationOk: boolean;
  /** Diagnostic codes only. A message can quote what the provider said, a code cannot. */
  issueCodes: readonly string[];
};

/** Which source a charged figure came from. */
export type ModelRunCallChargeBasis = "reported" | "reserved";

/** What the ledger charged the run for one call. */
export type ModelRunCallCharge = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  tokens: ModelRunCallChargeBasis;
  cost: ModelRunCallChargeBasis;
};

export type ModelRunCallRecord = {
  /** 1-based position in the order the ledger counted the run's calls. */
  sequence: number;
  /**
   * The provider request this record is of. `null` only for a build's call: a
   * build keeps no reservation, so its records are read back afterwards from
   * the evidence loop's own trace, which records the call the model made and
   * not the request id the harness sent it under. Every run record has one.
   */
  requestId: string | null;
  taskKind: string | null;
  stage: string | null;
  allowance: ModelRunBudgetAllowance;
  promptVersion: string | null;
  provider: string | null;
  model: string | null;
  /** `null` when the caller settled the call without saying how it ended. */
  validation: { ok: boolean; issueCodes: string[] } | null;
  /** The provider's own figures. `null` wherever it reported none. */
  reported: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; estimatedCostUsd: number | null };
  charged: ModelRunCallCharge;
  /** Whether the ledger counted this call as a budget breach. */
  budgetBreach: boolean;
};

/** Issue codes one record keeps. A call that fails fails on a handful. */
const MAX_ISSUE_CODES = 16;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,199}$/u;
const ISSUE_CODE = /^[a-z][a-z0-9_.-]{0,127}$/u;

/** One call's record, built from what the ledger knows when it counts the call. */
export function modelRunCallRecord(input: {
  sequence: number;
  /** `null` only where the caller genuinely has none, which is a build and never a run. */
  requestId: string | null;
  allowance: ModelRunBudgetAllowance;
  description?: Partial<ModelRunCallDescription> | undefined;
  outcome?: ModelRunCallOutcome | undefined;
  usage?: AutomationStudioLlmUsageSummary | undefined;
  charged: ModelRunCallCharge;
  budgetBreach: boolean;
}, policy: ModelReceiptPolicy): ModelRunCallRecord {
  const description = input.description;
  const stage = description?.stage;
  return {
    sequence: input.sequence,
    requestId: input.requestId,
    taskKind: taskKind(description?.taskKind, policy),
    stage: policy.isStage(stage) ? stage : null,
    allowance: input.allowance,
    promptVersion: identifier(description?.promptVersion),
    provider: identifier(description?.provider),
    model: identifier(description?.model),
    validation: input.outcome
      ? { ok: input.outcome.validationOk === true, issueCodes: [...new Set(input.outcome.issueCodes.filter((code) => typeof code === "string" && ISSUE_CODE.test(code)))].slice(0, MAX_ISSUE_CODES) }
      : null,
    reported: {
      inputTokens: tokenCount(input.usage?.inputTokens),
      outputTokens: tokenCount(input.usage?.outputTokens),
      totalTokens: tokenCount(input.usage?.totalTokens),
      estimatedCostUsd: cost(input.usage?.estimatedCostUsd)
    },
    charged: { ...input.charged },
    budgetBreach: input.budgetBreach
  };
}

function taskKind(value: unknown, policy: ModelReceiptPolicy): string | null {
  return policy.isTaskKind(value) ? value : null;
}

function identifier(value: unknown): string | null {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : null;
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function cost(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * What a build knows about one of its own provider calls.
 *
 * A build is not a run: it holds no budget lease, so nothing reserves, counts
 * or charges its calls one by one, and the per-call ledger above never saw
 * them. What it does keep is the evidence loop's trace, which already records
 * one row per decision with the usage the provider reported for it -- so a
 * build's calls can be itemized after the fact from the record it already
 * wrote, without changing anything about how a build runs.
 */
export type ModelBuildCall = {
  /** 1-based position among the build's provider calls, in the order it made them. */
  sequence: number;
  requestId?: string | undefined;
  /** Whatever of the call's description the build can say. A build knows its provider and model; it may not know the rest per call. */
  description?: Partial<ModelRunCallDescription> | undefined;
  outcome?: ModelRunCallOutcome | undefined;
  usage?: AutomationStudioLlmUsageSummary | undefined;
};

/**
 * One of a build's calls, in the same record a run's calls are itemized in, so
 * one reader reads both. A downstream consumer had no per-call lines for a
 * build at all and published an empty list beside a total it could not break
 * down.
 *
 * `charged` is the build's own arithmetic rather than a ledger's: a build has
 * no reservation to fall back on, and its accounting adds up exactly what the
 * provider reported, treating an unreported figure as zero. So `charged`
 * reproduces the build's totals, and the `tokens` and `cost` flags still say
 * which figures were measured -- `reserved` on a build means the provider
 * reported none and zero was carried, never that something was reserved.
 */
export function modelBuildCallRecord(input: ModelBuildCall, policy: ModelReceiptPolicy): ModelRunCallRecord {
  const reportedInput = tokenCount(input.usage?.inputTokens);
  const reportedOutput = tokenCount(input.usage?.outputTokens);
  const reportedTotal = tokenCount(input.usage?.totalTokens);
  const reportedCost = cost(input.usage?.estimatedCostUsd);
  const measuredTokens = reportedInput !== null || reportedOutput !== null || reportedTotal !== null;
  const inputTokens = reportedInput ?? 0;
  const outputTokens = reportedOutput ?? 0;
  return modelRunCallRecord({
    sequence: input.sequence,
    // A build that has no request id says so rather than inventing one.
    requestId: identifier(input.requestId),
    // Every call a build makes is an exploration decision. It is a label on
    // the receipt, not a budget of its own.
    allowance: "exploration",
    ...(input.description ? { description: input.description } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ...(input.usage ? { usage: input.usage } : {}),
    charged: {
      inputTokens,
      outputTokens,
      totalTokens: reportedTotal ?? inputTokens + outputTokens,
      estimatedCostUsd: reportedCost ?? 0,
      tokens: measuredTokens ? "reported" : "reserved",
      cost: reportedCost !== null ? "reported" : "reserved"
    },
    budgetBreach: false
  }, policy);
}
