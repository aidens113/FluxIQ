// The attempt's stored row as it stands, and the two records it is made of. Written between
// rounds and at every wait, so a process that dies leaves the best result so far and the draft
// rather than nothing, and written at the ending (`./ending.ts`) through the contract's own check.

import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioTaskAttempt, type AutomationStudioTaskResult, type AutomationStudioTaskResultRows } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstResult } from "../../../../../runtime/answer-first/result/index.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

/** The attempt as it stands, by status. */
export function automationStudioAnswerFirstAttemptAs(run: AutomationStudioAnswerFirstAttemptRun, status: { status: "working" | "achieved" | "budget_out" | "stopped_by_person" } | { status: "waiting_for_person"; waitingFor: "permission" | "person_only_check" | "stuck_in_a_loop" }): AutomationStudioTaskAttempt {
  const now = Date.now();
  const ended = status.status === "achieved" || status.status === "budget_out" || status.status === "stopped_by_person";
  const purse = run.input.creation.purse;
  const { usage: authority } = run.input.authority;
  return {
    taskId: run.taskId,
    attemptId: run.attemptId,
    ordinal: run.ordinal,
    projectId: run.input.projectId,
    flowId: run.input.flowId,
    runId: run.runId,
    path: "explore",
    ...status,
    spend: {
      calls: purse.spentCalls(),
      inputTokens: run.usage.inputTokens + authority.inputTokens,
      outputTokens: run.usage.outputTokens + authority.outputTokens,
      usd: Math.max(0, purse.spentUsd()),
      ms: Math.max(0, now - run.startedAtMs)
    },
    budget: { usd: purse.ceilingUsd },
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
  return automationStudioAnswerFirstResult({
    attemptId: run.attemptId,
    label,
    timesChecked: state.timesChecked,
    ...(rowsOf(run, rows) ? { rows: rowsOf(run, rows)! } : {}),
    acts: run.record.acts(),
    ...(state.answerText !== undefined ? { answerText: state.answerText } : {}),
    ...(state.checkedWhat !== undefined ? { checkedWhat: state.checkedWhat } : {}),
    ...(missingWhat !== undefined ? { missingWhat } : {})
  });
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
    await run.store.save(run.input.projectId, run.input.flowId, { attempt, result, tried: run.tried.data(), steps: run.steps });
    return { ok: true };
  } catch (error) {
    return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
  }
}
