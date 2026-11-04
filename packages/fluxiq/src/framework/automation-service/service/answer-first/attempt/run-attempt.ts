// One answer-first attempt: one live exploration that must reach the person's result (plan, D1),
// run from the generation path once the common path has made its binding, provider and
// instruction authority. `./rounds.ts` drives it, and `./ending.ts` ends it.
//
// **Its own gate.** The common path's permission gate wraps the domain directly, and this one must
// wrap the act gate and the row sink too (permission gate -> act gate -> row sink), with no clock
// on its question. It is made here from the same input, as a project build's briefs make theirs.
//
// **Its purse is opened by the common path**, as a repair's: no creation record carried or
// written, the ceiling `automationStudioAnswerFirstBudgetUsd`'s. The judge's call is kept back.
//
// **The rows' reader only processes once the session has ended**, since processing is what a run's
// end does. Before that a read-back answers the rows as they were collected, which is what a
// completion is judged on.

import { createHash, randomUUID } from "node:crypto";
import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstAskedRepeats } from "../../../../../runtime/answer-first/asked-count/index.ts";
import { automationStudioAnswerFirstKeepBackJudge } from "../../../../../runtime/answer-first/attempt-purse/index.ts";
import { automationStudioLlmLoopAttemptRecord } from "../../../../../runtime/llm/repeat-guard/index.ts";
import { AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS } from "../../../../../runtime/automation-parking/index.ts";
import { automationStudioFlowBootstrapActionPermissions, flowBootstrapPhaseFailure } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { automationStudioFlowLessJudge, type AutomationStudioResultEndView } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioLlmStepLogScope } from "../../../../../runtime/llm/step-log/index.ts";
import { AutomationStudioAnswerFirstAttemptsUnreadable, automationStudioAnswerFirstAttemptStoreOf } from "../attempt-store/index.ts";
import { automationStudioAnswerFirstCompletionCheck } from "../completion/index.ts";
import { automationStudioEndViewLook } from "../../end-view/index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationAnswered } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstRowSink, automationStudioAnswerFirstSession } from "../rows/index.ts";
import { automationStudioAnswerFirstRunActStoreOf } from "../run-acts/index.ts";
import { automationStudioAnswerFirstWitnesses } from "../witnesses/index.ts";
import { automationStudioAnswerFirstCallChain } from "./call-chain.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "./contracts.ts";
import { automationStudioAnswerFirstFinish } from "./ending.ts";
import { automationStudioAnswerFirstKeep } from "./keep.ts";
import { automationStudioAnswerFirstUnboundedPort } from "./person-wait.ts";
import { automationStudioAnswerFirstAttemptPorts } from "./ports.ts";
import { automationStudioAnswerFirstRounds } from "./rounds.ts";
import { automationStudioAnswerFirstSay } from "./say.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";
import { automationStudioAnswerFirstHoldAnswer } from "./stop-answer.ts";

export async function runAutomationStudioAnswerFirstAttempt(input: AutomationStudioAnswerFirstAttemptInput): Promise<AutomationStudioGenerateFlowBootstrapAdaptationAnswered> {
  if (!input.binding?.tools.length) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.evidence_runtime_unavailable");
  const run = await opened(input);
  automationStudioAnswerFirstKeepBackJudge(input.creation.purse);
  // The common path's purse is opened as a repair's, whose part it would write: this is an attempt's creation.
  const ending = await automationStudioLlmStepLogScope.within({ part: "creation" }, () => automationStudioAnswerFirstRounds(run));
  if (ending === "setup_needed") {
    await endedUntried(run);
    throw run.setupRefusal;
  }
  const answer = await automationStudioAnswerFirstFinish(run, ending);
  automationStudioAnswerFirstHoldAnswer(input.request, answer);
  return answer;
}

/** Nothing was tried, so nothing is kept of it but the session it opened, which says so. A session not written costs that record, and the person is still told what to do. */
async function endedUntried(run: AutomationStudioAnswerFirstAttemptRun): Promise<void> {
  try {
    await run.session.end("cancelled");
  } catch {
    automationStudioAnswerFirstSay("Part of the record was not written", "Nothing was done, but part of what goes with that could not be written down.");
  }
}

async function opened(input: AutomationStudioAnswerFirstAttemptInput): Promise<AutomationStudioAnswerFirstAttemptRun> {
  const { projectId, flowId, stores, cancellation } = input;
  const attemptId = `attempt.${randomUUID()}`;
  const runId = `explore.${randomUUID()}`;
  const store = automationStudioAnswerFirstAttemptStoreOf(input.owner, stores);
  const acts = automationStudioAnswerFirstRunActStoreOf(input.owner, stores);
  // The instruction is the person's: Core refuses to save or count one written from a command's argument (`../../flow-bootstrap-commands/save-goal.ts`, `../../instruction-led/task.ts`).
  const asked = automationStudioAnswerFirstAskedRepeats(input.instructionText);
  // The same answer as the loop's `askedRepeats` (`./round.ts`), so the record and the detector agree on how many of one act the person asked for.
  const record = new AutomationStudioAttemptActRecord({ persist: (data) => acts.save(projectId, flowId, data), asked: () => asked(run.claim) });
  const tried = automationStudioLlmLoopAttemptRecord();
  const session = await automationStudioAnswerFirstSession({ openSession: stores.openSession, writeSession: stores.writeSession, runId, attemptId });
  let sessionEnded = false;
  const ending = {
    ...session,
    end: async (status: Parameters<typeof session.end>[0]) => {
      await session.end(status);
      sessionEnded = true;
    }
  };
  const datasets = stores.datasets;
  const sink = automationStudioAnswerFirstRowSink({
    runId,
    readRowsKey: input.binding?.readRowsKey,
    // A host with no project store has nowhere to put rows: the sink's own account is all there is, and a read-back answers from it.
    onRecordBatch: datasets.available ? datasets.recordBatchHandler(projectId, runId) : async () => ({}) as unknown as AutomationStudioRunDatasetSummary,
    reader: {
      listDatasets: () => datasets.listRunDatasetsForVerification({ projectId, runId }),
      getPage: ({ datasetId, limit, cursor }) => datasets.getRunDatasetPage({ projectId, runId, datasetId, limit, ...(cursor === undefined ? {} : { cursor }) }),
      process: async () => { if (sessionEnded) await datasets.processEndedRunDatasets({ projectId, runId }); }
    }
  });
  const look = automationStudioEndViewLook({ tools: input.harnessOptions.tools, viewKeys: input.harnessOptions.observedStateKeys });
  let looks = 0;
  // Through the domain alone: a look is no call of the task's, and it reaches none of its records.
  const lookNow = async (): Promise<AutomationStudioResultEndView | undefined> => look?.({ callId: `core.attempt_look.${(looks += 1)}`, executeTool: (call) => run.options.executeTool(call) });
  const witnesses = automationStudioAnswerFirstWitnesses({ read: async () => (await lookNow())?.view as JsonObject | undefined });
  const completion = automationStudioAnswerFirstCompletionCheck({
    instructions: input.instructionText,
    rows: () => sink.readBack(),
    acts: () => record.acts(),
    endView: async () => (await automationStudioAnswerFirstEndViewRead(lookNow)).view,
    witnesses: () => witnesses.readings(),
    purse: input.creation.purse,
    say: automationStudioAnswerFirstSay,
    judge: (summary) => automationStudioFlowLessJudge({
      personHeldMs: () => run.waitedMs + (run.ports.personHeldMs?.({ projectId, flowId }) ?? 0),
      summary, provider: input.provider.provider, projectId, flowId, runId, deniedEvidenceKeys: input.binding?.deniedEvidenceKeys ?? [],
      ...(input.provider.timeoutMs !== undefined ? { timeoutMs: input.provider.timeoutMs } : {}),
      ...(cancellation.signal() ? { signal: cancellation.signal() } : {}),
      run: async (request) => {
        const judged = await input.runHarness(request);
        run.usage.estimatedInputTokens += judged.request.estimatedInputTokens;
        run.usage.inputTokens += judged.usage?.inputTokens ?? 0;
        run.usage.outputTokens += judged.usage?.outputTokens ?? 0;
        run.usage.totalTokens += judged.usage?.totalTokens ?? 0;
        return judged;
      }
    })
  });
  const describe = input.binding?.describeCall?.bind(input.binding);
  const chain = automationStudioAnswerFirstCallChain({
    domain: (call) => run.options.executeTool(call),
    record, sink, witnesses,
    readRowsKey: input.binding?.readRowsKey,
    describe: describe ? (call) => describe({ projectId, flowId, ...call }) : undefined,
    stepped: () => { run.liveSteps += 1; },
    answered: () => { run.arrived = true; }
  });
  const ground = input.permissionGround;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    ...ground,
    ask: ground.ask ? {
      ...ground.ask,
      // Any wait at all makes the gate wait; the port takes the clock off it (`./person-wait.ts`).
      timeoutMs: AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS,
      port: automationStudioAnswerFirstUnboundedPort(ground.ask.port, (state, waited) => {
        run.waitingFor = state === "started" ? "permission" : undefined;
        run.waitedMs += waited;
        void automationStudioAnswerFirstKeep(run);
      })
    } : undefined,
    executeTool: cancellation.tool(chain)
  });
  const run: AutomationStudioAnswerFirstAttemptRun = {
    input, ports: automationStudioAnswerFirstAttemptPorts(input.owner), store,
    taskId: `task.${createHash("sha256").update(input.instructionText).digest("hex").slice(0, 40)}`,
    attemptId, ordinal: await nextOrdinal(store, projectId, flowId), runId, startedAtMs: Date.now(),
    record, tried, asked, sink, session: ending, witnesses, completion, permissions, options: input.harnessOptions,
    steps: [], usage: { estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    liveSteps: 0, arrived: false, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), backoffs: 0, waitedMs: 0, askPerson: false
  };
  return run;
}

/** A look that failed reads as none, and says so to nobody: an unread page proves nothing either way. */
async function automationStudioAnswerFirstEndViewRead(look: () => Promise<AutomationStudioResultEndView | undefined>): Promise<{ view?: AutomationStudioResultEndView; errorName?: string }> {
  try {
    const view = await look();
    return view ? { view } : {};
  } catch (error) {
    return { errorName: error instanceof Error ? error.name : "unknown" };
  }
}

/** Which attempt at this Flow this is. A file nobody can read holds no count anyone can use, and must not stop the task. */
async function nextOrdinal(store: AutomationStudioAnswerFirstAttemptRun["store"], projectId: string, flowId: string): Promise<number> {
  try {
    return (await store.list(projectId, flowId)).length + 1;
  } catch (error) {
    if (error instanceof AutomationStudioAnswerFirstAttemptsUnreadable) return 1;
    throw error;
  }
}
