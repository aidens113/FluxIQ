// One provider call, as a run's receipt itemizes it.
//
// The run ledger's snapshot says what a run spent in total. That was enough
// while a run made two calls, each of which left an intervention behind. It
// stopped being enough once a recovery could iterate: the calls that gather
// evidence between the diagnosis and the patch leave no intervention, so a run
// that gathered six times and a run that gathered once had the same trace, the
// Lab's per-call budget checks never saw those calls, and nothing could certify
// what an iterating run actually did. The totals were right; nobody could say
// what made them up.
//
// A record is written by the ledger at the moment it counts a call, so the
// records and the snapshot are two views of one event and cannot disagree about
// which calls happened. Each record keeps two things apart that are easy to
// blur:
//
// - `reported` is what the provider said the call used, and nothing else. A
//   figure the provider did not report is `null`. It is never filled in from
//   the reservation.
// - `charged` is what the ledger put on the run's account for the call, which
//   is the reservation wherever the provider's report could not be used. Its
//   `tokens` and `cost` say which, so the records add up to the snapshot and a
//   reader can still tell a measured call from an assumed one.
//
// Nothing here carries prompt text, response text or a diagnostic message:
// identifiers, codes and numbers only, each bounded.

import type { AutomationStudioLlmUsageSummary } from "./harness/provider.ts";
import { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, type AutomationStudioLlmTaskKind } from "./harness/task-kind.ts";
import type { AutomationStudioLlmRunBudgetAllowance } from "./run-budget.ts";
import { isAutomationStudioLoopStage, type AutomationStudioLoopStage } from "./stages/protocol.ts";

/** What a call is, known before it is sent. */
export type AutomationStudioLlmRunCallDescription = {
  taskKind: AutomationStudioLlmTaskKind;
  /** The loop stage the call was made in. Absent for a call outside the protocol. */
  stage?: AutomationStudioLoopStage;
  promptVersion: string;
  provider: string;
  model: string;
};

/** How a call ended, known once its answer was checked. */
export type AutomationStudioLlmRunCallOutcome = {
  validationOk: boolean;
  /** Diagnostic codes only. A message can quote what the provider said, a code cannot. */
  issueCodes: readonly string[];
};

/** Which source a charged figure came from. */
export type AutomationStudioLlmRunCallChargeBasis = "reported" | "reserved";

/** What the ledger charged the run for one call. */
export type AutomationStudioLlmRunCallCharge = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  tokens: AutomationStudioLlmRunCallChargeBasis;
  cost: AutomationStudioLlmRunCallChargeBasis;
};

export type AutomationStudioLlmRunCallRecord = {
  /** 1-based position in the order the ledger counted the run's calls. */
  sequence: number;
  requestId: string;
  taskKind: AutomationStudioLlmTaskKind | null;
  stage: AutomationStudioLoopStage | null;
  allowance: AutomationStudioLlmRunBudgetAllowance;
  promptVersion: string | null;
  provider: string | null;
  model: string | null;
  /** `null` when the caller settled the call without saying how it ended. */
  validation: { ok: boolean; issueCodes: string[] } | null;
  /** The provider's own figures. `null` wherever it reported none. */
  reported: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; estimatedCostUsd: number | null };
  charged: AutomationStudioLlmRunCallCharge;
  /** Whether the ledger counted this call as a budget breach. */
  budgetBreach: boolean;
};

/** Issue codes one record keeps. A call that fails fails on a handful. */
const MAX_ISSUE_CODES = 16;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,199}$/u;
const ISSUE_CODE = /^[a-z][a-z0-9_.-]{0,127}$/u;

/** One call's record, built from what the ledger knows when it counts the call. */
export function automationStudioLlmRunCallRecord(input: {
  sequence: number;
  requestId: string;
  allowance: AutomationStudioLlmRunBudgetAllowance;
  description?: AutomationStudioLlmRunCallDescription | undefined;
  outcome?: AutomationStudioLlmRunCallOutcome | undefined;
  usage?: AutomationStudioLlmUsageSummary | undefined;
  charged: AutomationStudioLlmRunCallCharge;
  budgetBreach: boolean;
}): AutomationStudioLlmRunCallRecord {
  const description = input.description;
  const stage = description?.stage;
  return {
    sequence: input.sequence,
    requestId: input.requestId,
    taskKind: taskKind(description?.taskKind),
    stage: isAutomationStudioLoopStage(stage) ? stage : null,
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

function taskKind(value: unknown): AutomationStudioLlmTaskKind | null {
  return typeof value === "string" && Object.hasOwn(AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, value) ? value as AutomationStudioLlmTaskKind : null;
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
