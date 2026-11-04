// The attempt's stored row as it stands, and the two records it is made of. Written at every
// decision, every wait and between rounds, so a process that dies leaves the best result so far,
// what it spent and the draft rather than nothing, and written at the ending (`./ending.ts`)
// through the contract's own check. A carried-on attempt's counts are what it had and this segment's.

import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioTaskAttempt, type AutomationStudioTaskAttemptPath, type AutomationStudioTaskResult, type AutomationStudioTaskResultRows, type AutomationStudioTaskResultSource } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstResult } from "../../../../../runtime/answer-first/result/index.ts";
import { automationStudioAnswerFirstTriedAsContract } from "../loop-signal/index.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

/** Where a result came from, by how the attempt went: the contract's word for each path. */
const SOURCE_OF_PATH: Readonly<Record<AutomationStudioTaskAttemptPath, AutomationStudioTaskResultSource>> = { explore: "exploration", run_flow: "flow", run_flow_then_repair: "both", run_flow_then_explore: "both" };

/** The attempt as it stands, by status. */
export function automationStudioAnswerFirstAttemptAs(run: AutomationStudioAnswerFirstAttemptRun, status: { status: "working" | "achieved" | "budget_out" | "stopped_by_person" } | { status: "waiting_for_person"; waitingFor: "permission" | "person_only_check" | "stuck_in_a_loop" | "model_key_locked" }): AutomationStudioTaskAttempt {
  const now = Date.now();
  const ended = status.status === "achieved" || status.status === "budget_out" || status.status === "stopped_by_person";
  const purse = run.input.creation.purse;
  const { usage: authority } = run.input.authority;
  const prior = run.prior;
  return {
    taskId: run.taskId,
    attemptId: run.attemptId,
    ordinal: run.ordinal,
    projectId: run.input.projectId,
    flowId: run.input.flowId,
    runId: run.runId,
    path: run.path,
    ...status,
    spend: {
      calls: (prior?.spend.calls ?? 0) + purse.spentCalls(),
      inputTokens: (prior?.spend.inputTokens ?? 0) + run.usage.inputTokens + authority.inputTokens,
      outputTokens: (prior?.spend.outputTokens ?? 0) + run.usage.outputTokens + authority.outputTokens,
      usd: (prior?.spend.usd ?? 0) + Math.max(0, purse.spentUsd()),
      ms: (prior?.spend.ms ?? 0) + Math.max(0, now - run.segmentStartedAtMs)
    },
    // A carry-on's is what the press made it, less whatever the host's total held the purse below that: it says what the attempt really has.
    budget: { usd: prior ? prior.budgetUsd - Math.max(0, prior.askedUsd - purse.ceilingUsd) : purse.ceilingUsd },
    liveSteps: run.liveSteps,
    loopsCaught: run.loopsCaught ?? automationStudioTaskAttemptNoLoopsCaught(),
    startedAtMs: run.startedAtMs,
    ...(ended ? { endedAtMs: Math.max(now, run.startedAtMs) } : {})
  };
}

/** What the attempt has got, as the contract's record, however it stands. */
export function automationStudioAnswerFirstResultAs(run: AutomationStudioAnswerFirstAttemptRun, rows: AutomationStudioAnswerFirstRowsSummary, missingWhat?: string): AutomationStudioTaskResult {
  const { state } = run.completion;
  const label = state.achieved ? "confirmed" : state.refused?.verdict === "no" ? "refuted" : "unverified";
  const result = automationStudioAnswerFirstResult({
    attemptId: run.attemptId,
    label,
    timesChecked: state.timesChecked,
    ...(rowsOf(run, rows) ? { rows: rowsOf(run, rows)! } : {}),
    acts: run.record.acts(),
    ...(state.answerText !== undefined ? { answerText: state.answerText } : {}),
    ...(state.checkedWhat !== undefined ? { checkedWhat: state.checkedWhat } : {}),
    ...(missingWhat !== undefined ? { missingWhat } : {})
  });
  return { ...result, source: SOURCE_OF_PATH[run.path] };
}

function rowsOf(run: AutomationStudioAnswerFirstAttemptRun, rows: AutomationStudioAnswerFirstRowsSummary): AutomationStudioTaskResultRows | undefined {
  if (rows.datasetId === undefined) return undefined;
  return { runId: run.runId, datasetId: rows.datasetId, totalRows: rows.totalRows, truncated: rows.truncated, columns: rows.columns, previewRows: rows.rows };
}

/** Writes the attempt's row as it stands now. A store that fails costs this write and never the attempt: the next one tries again. */
export async function automationStudioAnswerFirstKeep(run: AutomationStudioAnswerFirstAttemptRun): Promise<{ ok: true } | { ok: false; errorName: string }> {
  try {
    const attempt = automationStudioAnswerFirstAttemptAs(run, run.waitingFor ? { status: "waiting_for_person", waitingFor: run.waitingFor } : { status: "working" });
    const result = automationStudioAnswerFirstResultAs(run, run.sink.summary());
    await run.store.save(run.input.projectId, run.input.flowId, { attempt, result, tried: automationStudioAnswerFirstTriedAsContract(run.tried.data()), steps: run.steps });
    return { ok: true };
  } catch (error) {
    return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
  }
}
