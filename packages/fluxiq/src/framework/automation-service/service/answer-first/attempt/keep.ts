// The attempt's stored row as it stands, and the two records it is made of. Written at every
// decision, every wait and between rounds, so a process that dies leaves the best result so far,
// what it spent and the draft rather than nothing, and written at the ending (`./ending.ts`)
// through the contract's own check. A carried-on attempt's counts are what it had and this segment's.
// Its rows are the answer the attempt's one result holds (`../result-feed/`): the output step's pages, never a look.

import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioTaskAttempt, type AutomationStudioTaskAttemptPath, type AutomationStudioTaskResult, type AutomationStudioTaskResultRows, type AutomationStudioTaskResultSource } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstResult } from "../../../../../runtime/answer-first/result/index.ts";
import { automationStudioAnswerFirstReplayKept } from "../completion/index.ts";
import { automationStudioAnswerFirstTriedAsContract } from "../loop-signal/index.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";
import { automationStudioAnswerFirstTrailsOf } from "../trail/index.ts";

/** Where a result came from, by how the attempt went: the contract's word for each path. */
const SOURCE_OF_PATH: Readonly<Record<AutomationStudioTaskAttemptPath, AutomationStudioTaskResultSource>> = { explore: "exploration", run_flow: "flow", run_flow_then_repair: "both", run_flow_then_explore: "both" };

/** The attempt as it stands, by status. */
export function automationStudioAnswerFirstAttemptAs(run: AutomationStudioAnswerFirstAttemptRun, status: { status: "working" | "achieved" | "budget_out" | "stopped_by_person" } | { status: "waiting_for_person"; waitingFor: "permission" | "person_only_check" | "stuck_in_a_loop" }): AutomationStudioTaskAttempt {
  const now = Date.now();
  const ended = status.status === "achieved" || status.status === "budget_out" || status.status === "stopped_by_person";
  const purse = run.input.creation.purse;
  const { usage: authority } = run.input.authority;
  const prior = run.prior;
  // Not added, as with the rows left out: the record is seeded with what a carried-on attempt had, so its count already holds them.
  const noRow = Math.max(prior?.actsWithNoRow ?? 0, run.record.actsWithNoRow());
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
    // Its caller turned checking off (its judge `off` and no check of its own), so its result is taken as it stands, unverified (`./ending.ts`).
    ...(checkingOff(run) ? { checkingOff: true as const } : {}),
    ...(noRow > 0 ? { actsWithNoRow: noRow } : {}),
    ...(run.startedFrom && run.route.kind !== "build" ? { startedFrom: { route: run.route.kind, attemptId: run.startedFrom.attemptId, stepsDigest: run.startedFrom.stepsDigest } } : {}),
    startedAtMs: run.startedAtMs,
    ...(ended ? { endedAtMs: Math.max(now, run.startedAtMs) } : {})
  };
}

function checkingOff(run: AutomationStudioAnswerFirstAttemptRun): boolean {
  const caller = run.input.caller;
  return caller?.judge === "off" && caller.check === undefined;
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
    ...(missingWhat !== undefined ? { missingWhat } : {}),
    // Not added: the same row left out again in a later segment is one row. The larger is what is known at the least.
    skippedAsDone: Math.max(run.prior?.skippedAsDone ?? 0, run.record.rowsHeldDone())
  });
  return { ...result, source: SOURCE_OF_PATH[run.path] };
}

function rowsOf(run: AutomationStudioAnswerFirstAttemptRun, rows: AutomationStudioAnswerFirstRowsSummary): AutomationStudioTaskResultRows | undefined {
  if (rows.datasetId === undefined) return undefined;
  // The note that a later read got smaller, where it is still true of the rows the result holds: the contract refuses one that is not.
  const smaller = rows.fewerThanEarlier !== undefined && rows.fewerThanEarlier.earlierRows > rows.totalRows ? { fewerThanEarlier: { earlierRows: rows.fewerThanEarlier.earlierRows } } : {};
  return { runId: run.runId, datasetId: rows.datasetId, totalRows: rows.totalRows, truncated: rows.truncated, columns: rows.columns, previewRows: rows.rows, ...smaller };
}

/**
 * Writes the attempt's row as it stands now. A store that fails costs this write and never the attempt: the next one tries again.
 *
 * **A wait is a place the attempt may rest for as long as the person takes**, and its row names the dataset that is
 * its result and how many rows that holds. The store keeps every batch as it was collected until the dataset is
 * processed, which an ending does (`./ending.ts`), so a row written at a wait named an answer of 4 while its dataset
 * served the 28 rows of seven reads of the same 4 (`run-mw43h5ew-a04a583d`), to the Data window, an export and the
 * Lab alike. So the run's datasets are processed here too, best-effort as an ending's are. It is undone by the next
 * read's batch, which makes the dataset collected rows again, and the ending processes it once more.
 *
 * **At a wait the datasets are processed before the row is written**, so whoever sees the waiting row reads a dataset
 * that already serves what the row says. Written first, a reader that saw the row could read the dataset before its
 * processing ended (lane t905, `./tests/keep.test.ts` under load). The row is built after processing, from the run as it
 * then stands: a wait that ended meanwhile is not written back as waiting. Processing that fails still costs only
 * itself: the row is written, and the keep answers with that failure. A wait that awaits this (`./rounds.ts`, the
 * stuck question) asks only once both are done.
 */
export async function automationStudioAnswerFirstKeep(run: AutomationStudioAnswerFirstAttemptRun): Promise<{ ok: true } | { ok: false; errorName: string }> {
  try {
    const waiting = run.waitingFor !== undefined;
    run.result.draft(run.steps);
    if (run.result.readiness().state === "missing-evidence") await run.sink.withhold();
    else await run.sink.publish(run.result.rows(), run.result.evidence());
    const processing = waiting ? await processed(run) : { ok: true as const };
    const attempt = automationStudioAnswerFirstAttemptAs(run, run.waitingFor ? { status: "waiting_for_person", waitingFor: run.waitingFor } : { status: "working" });
    const result = automationStudioAnswerFirstResultAs(run, run.result.rows());
    const journal = automationStudioAnswerFirstTrailsOf(run.input.owner);
    const judgeEvidence = journal.checkpoint(run.trail, run.witnesses.readings(), { ...journal.capability(run.trail, run.input.binding), projectJudgeEvidence: run.input.binding?.projectJudgeEvidence, deniedEvidenceKeys: run.input.binding?.deniedEvidenceKeys, resultEvidence: run.result.sourceProof() });
    const kept = { attempt, result, publications: run.sink.publicationState(), tried: automationStudioAnswerFirstTriedAsContract(run.tried.data()), steps: run.steps, ...(run.processingReferenceTimeMs === undefined ? {} : { processingReferenceTimeMs: run.processingReferenceTimeMs }), ...(run.result.processingDeclaration() === undefined ? {} : { processing: run.result.processingDeclaration()!, resultEvidence: run.result.evidence() }), ...(judgeEvidence === undefined ? {} : { judgeEvidence }), ...automationStudioAnswerFirstReplayKept(run.completion.state) };
    const sourceOwner = journal.sourceOwner(run.trail);
    if (judgeEvidence !== undefined && sourceOwner !== undefined) {
      await run.store.save(run.input.projectId, run.input.flowId, kept, { sourceOwner });
      journal.recovered(run.trail, await run.store.saveJudgeEvidence(run.input.projectId, run.input.flowId, run.attemptId, judgeEvidence, { sourceOwner }));
    } else await run.store.save(run.input.projectId, run.input.flowId, kept);
    const declaration = run.result.processingDeclaration();
    if (declaration !== undefined) await run.memory.update(run.input.projectId, run.taskId, (current) => ({ ...current, processing: declaration }), { scoped: run.input.caller?.actScope !== undefined });
    return processing;
  } catch (error) {
    return failed(error);
  }
}

/** The run's datasets processed, best-effort: a failure is answered, never thrown, so the row is still written. */
async function processed(run: AutomationStudioAnswerFirstAttemptRun): Promise<{ ok: true } | { ok: false; errorName: string }> {
  try {
    await run.input.stores.datasets.processEndedRunDatasets({ projectId: run.input.projectId, runId: run.runId });
    return { ok: true };
  } catch (error) {
    return failed(error);
  }
}

function failed(error: unknown): { ok: false; errorName: string } {
  return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
}
