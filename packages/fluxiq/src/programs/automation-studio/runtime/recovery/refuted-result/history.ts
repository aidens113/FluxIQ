// What earlier repairs of this run's answer produced, and whether another one
// is worth making.
//
// **The finding this acts on.** `run-mulwm2dc-0bd95f22`: a Flow returned twelve
// unfiltered rows, the check refuted it with specific advice, the Flow was
// re-authored, and the re-authored Flow returned twelve unfiltered rows again.
// Core then stopped, because a run's answer was repaired once and never again
// (`repair.ts` answered nothing at its first line on the second refutation).
// One repair is too few for a loop whose job is to converge on the answer, and
// a second repair that is not told what the first one produced would only make
// the same edit again.
//
// **So a run is repaired up to `AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS`
// times, and every attempt after the first is shown the ones before it**: what
// each version of the Flow produced, with what parameters on the step the rows
// came out of, and why that answer was refuted. The history lives in memory for
// the length of the verification's own recursion, because the judgement's
// advice is a model's prose and a run record never carries that
// (`result-verification/verdict.ts`); the run record carries the counts.
//
// **Convergence is judged on what changed, not on a counter alone.** An attempt
// whose re-run produced exactly the answer it was asked to repair -- the same
// rows, the same columns, the same sampled values, the same findings -- changed
// nothing. The next attempt is told so in as many words. Two such attempts in a
// row is a loop that is not converging, and it stops with its own code instead
// of spending the rest of its bound repeating itself.

import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import type {
  AutomationStudioResultReadAccount,
  AutomationStudioResultRepairDirective,
  AutomationStudioResultVerificationOutcome,
  AutomationStudioRunResultSummary
} from "../../result-verification/index.ts";

/**
 * How many times one run's answer may be re-authored.
 *
 * Three: the first repair acts on the check's advice, the second on what the
 * first produced, and the third on both. Each is a full build under the run's
 * own cost, token and deadline ledger, which is the bound that matters; this is
 * the bound on a loop that keeps being refuted for reasons it cannot fix.
 */
export const AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS = 3;

/** The run's own record that its result was taken through the failure entry point (`repair.ts`). */
export const AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY = "resultRepair";

/** How many consecutive attempts may leave the answer unchanged before the loop stops. */
const MAX_UNCHANGED_IN_A_ROW = 2;

/** Why a refuted run was not re-authored again, in codes a reader can key on. */
export type AutomationStudioResultRepairStop =
  /** Every attempt the bound allows has been made. */
  | "result_repair.attempts_exhausted"
  /** The last attempts each re-ran to exactly the answer they were asked to repair. */
  | "result_repair.not_converging";

/**
 * One refuted answer, as the next repair is shown it.
 *
 * `attempt` is the repair this refutation opened: 1 for the Flow as first
 * built, 2 for the Flow the first repair produced, and so on.
 */
export type AutomationStudioResultRepairHistoryEntry = {
  attempt: number;
  /** Core's one-sentence reason for the refutation. */
  reason: string;
  /** Core's findings and fix lines, and the check's own screened reading. */
  directive?: AutomationStudioResultRepairDirective;
  /** What the refuted run stored: counts and column ids, never values. */
  produced: { totalRecordCount: number; recordSets: Array<{ recordCount: number; columns: string[] }> };
  /** The step the rows came out of, with the parameters it was authored with, as the result summary carried them (already screened). */
  step?: { nodeId: string; definitionId: string; parameters?: string };
  /**
   * How each list read went, as the result summary carried it: pages, why
   * paging stopped, and what each condition rejected: what says the read
   * already paged and which of its conditions dropped the rows
   * (`run-munq5s8x-6d620cdf`).
   */
  reads?: AutomationStudioResultReadAccount[];
  /** A stable digest of the answer: rows, columns, sampled values and findings. Equal digests are the same answer. */
  answerDigest: string;
};

/**
 * The history entry a refutation amounts to.
 *
 * Built from what the verification already holds: its outcome and the result
 * summary it judged. `nodeId` is the node the refuted attempt was filed
 * against (`attempt.ts`), so the parameters recorded are the ones that step
 * ran with.
 */
export function automationStudioResultRepairHistoryEntry(input: {
  attempt: number;
  outcome: AutomationStudioResultVerificationOutcome;
  summary: AutomationStudioRunResultSummary;
  nodeId?: string | undefined;
}): AutomationStudioResultRepairHistoryEntry {
  const outcome = input.outcome;
  const directive = outcome.performed === true ? outcome.repair : undefined;
  const shape = input.summary.flowShape.find((step) => step.nodeId === input.nodeId);
  const parameters = shape?.parameters ? JSON.stringify(shape.parameters) : undefined;
  return {
    attempt: input.attempt,
    reason: outcome.reason,
    ...(directive ? { directive } : {}),
    produced: {
      totalRecordCount: input.summary.totalRecordCount,
      recordSets: input.summary.recordSets.map((set) => ({ recordCount: set.recordCount, columns: [...set.columns] }))
    },
    ...(shape ? { step: { nodeId: shape.nodeId, definitionId: shape.definitionId, ...(parameters ? { parameters } : {}) } } : {}),
    ...(input.summary.reads?.length ? { reads: input.summary.reads } : {}),
    answerDigest: answerDigest(input.summary, directive)
  };
}

/**
 * Whether the run whose answer was just refuted gets another repair.
 *
 * `history` is every refutation before this one, oldest first, and `current`
 * is this one. Attempt `n` is the `n`th entry; an entry's answer equal to the
 * one before it means the repair made in between changed nothing.
 */
export function automationStudioResultRepairContinuation(input: {
  history: readonly AutomationStudioResultRepairHistoryEntry[];
  current: AutomationStudioResultRepairHistoryEntry;
  maxAttempts?: number;
}): { repair: true } | { repair: false; stopped: AutomationStudioResultRepairStop } {
  const maxAttempts = input.maxAttempts ?? AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS;
  if (input.current.attempt > maxAttempts) return { repair: false, stopped: "result_repair.attempts_exhausted" };
  if (automationStudioResultRepairUnchangedInARow([...input.history, input.current]) >= MAX_UNCHANGED_IN_A_ROW) {
    return { repair: false, stopped: "result_repair.not_converging" };
  }
  return { repair: true };
}

/**
 * How many of the most recent repairs, counting back from the newest, re-ran
 * to exactly the answer they were asked to repair.
 */
export function automationStudioResultRepairUnchangedInARow(entries: readonly AutomationStudioResultRepairHistoryEntry[]): number {
  let unchanged = 0;
  for (let index = entries.length - 1; index > 0; index -= 1) {
    if (entries[index]!.answerDigest !== entries[index - 1]!.answerDigest) break;
    unchanged += 1;
  }
  return unchanged;
}

/**
 * The run record's account of one refutation: counts, codes and Core's own fix
 * lines. The judgement's prose and the parameters stay in memory, where the
 * next repair reads them.
 */
export function automationStudioResultRepairHistoryRecord(entry: AutomationStudioResultRepairHistoryEntry): JsonObject {
  return {
    attempt: entry.attempt,
    totalRecordCount: entry.produced.totalRecordCount,
    recordSetCount: entry.produced.recordSets.length,
    findingCodes: (entry.directive?.findings ?? []).map((finding) => finding.code),
    fix: [...(entry.directive?.fix ?? [])],
    advised: Boolean(entry.directive?.judgement?.advice),
    ...(entry.step ? { nodeId: entry.step.nodeId } : {}),
    answerDigest: entry.answerDigest
  };
}

function answerDigest(summary: AutomationStudioRunResultSummary, directive: AutomationStudioResultRepairDirective | undefined): string {
  const canonical = {
    total: summary.totalRecordCount,
    refused: summary.totalRefusedCount,
    sets: summary.recordSets.map((set) => ({ records: set.recordCount, columns: [...set.columns].sort(), rows: set.sampleRows ?? [] })),
    findings: (directive?.findings ?? []).map((finding) => finding.code).sort()
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
}
