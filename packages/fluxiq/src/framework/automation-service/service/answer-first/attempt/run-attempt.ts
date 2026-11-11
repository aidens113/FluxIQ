// One answer-first attempt: one live exploration that must reach the person's result (plan, D1),
// run from the generation path once the common path has made its binding, provider and
// instruction authority. `./rounds.ts` drives it, and `./ending.ts` ends it.
//
// A later attempt at the same task starts from what the task kept (`./opening.ts`): its saved Flow
// runs live and judged first (`./flow-stage.ts`), and the rounds carry on to the result if that was
// not it. A task with nothing saved goes straight to the rounds, as the first attempt always did.
//
// **A carry-on is this same attempt going on** (`../carry-on/`): the same
// ids, act record, tried record, steps and counts, with a new session and run, the rows found so
// far copied into it. It goes to the rounds and never runs the Flow from its start again.
//
// **A person's Run again is a new attempt with an empty record** (`../run-again/`), told by a scope a
// route sets and nothing in a request can, so no model can claim one. Its judge is told the person
// asked for a repeat, and judges this attempt's own change (`runtime/result-verification/flow-less/asked-again.ts`).
//
// **Live from before it opens until it has ended, however it ends** (`../interrupted/`): a row
// nobody is working on any more reads as interrupted, and a throw must not leave one reading live.
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
//
// **A caller that drives it from code** (`input.caller`, a FluxNode; `../caller/`) may bring its
// own task key (`./opening.ts`), check and judge mode (`../completion/check.ts`), person port and
// grant (`../caller/applied.ts`, `../caller/scope-gate.ts`). Each is optional, and a chat
// attempt has none of them, so it runs exactly as it did.

import { randomUUID } from "node:crypto";
import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, type AutomationStudioAttemptActRecordData } from "../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstAskedRepeats } from "../../../../../runtime/answer-first/asked-count/index.ts";
import { automationStudioAnswerFirstKeepBackJudge } from "../../../../../runtime/answer-first/attempt-purse/index.ts";
import { automationStudioLlmLoopAttemptRecord } from "../../../../../runtime/llm/repeat-guard/index.ts";
import { AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS } from "../../../../../runtime/automation-parking/index.ts";
import { automationStudioFlowBootstrapActionPermissions, flowBootstrapPhaseFailure } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { automationStudioFlowLessJudge, type AutomationStudioResultEndView } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioLlmStepLogScope } from "../../../../../runtime/llm/step-log/index.ts";
import { automationStudioAnswerFirstAttemptStoreOf } from "../attempt-store/index.ts";
import { automationStudioAnswerFirstCarriedOpening, automationStudioAnswerFirstCarryOnScope, type AutomationStudioAnswerFirstCarriedOpening, type AutomationStudioAnswerFirstCarryOnHold } from "../carry-on/index.ts";
import { automationStudioAnswerFirstCallerApplied, automationStudioAnswerFirstScopeGate } from "../caller/index.ts";
import { automationStudioAnswerFirstCompletionCheck, automationStudioAnswerFirstReplayOf } from "../completion/index.ts";
import { automationStudioAnswerFirstFlowRunEngineOf } from "../flow-run/index.ts";
import { automationStudioFlowHumanness } from "../../flow-settings/index.ts";
import { automationStudioEndViewLook } from "../../end-view/index.ts";
import { automationStudioAnswerFirstKnownParts } from "../../project-parts/index.ts";
import { automationStudioAnswerFirstAttemptsRead, automationStudioAnswerFirstLiveAttemptsOf } from "../interrupted/index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationAnswered } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstCopyRows, automationStudioAnswerFirstRowSink, automationStudioAnswerFirstSession } from "../rows/index.ts";
import { automationStudioAnswerFirstRunActStoreOf } from "../run-acts/index.ts";
import { automationStudioAnswerFirstRunAgainScope, type AutomationStudioAnswerFirstRunAgainHold } from "../run-again/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf } from "../task-memory/index.ts";
import { automationStudioAnswerFirstBeforeReadingsOf, automationStudioAnswerFirstEarlierBefore, automationStudioAnswerFirstWitnesses } from "../witnesses/index.ts";
import { automationStudioAnswerFirstBestEffort } from "./best-effort.ts";
import { automationStudioAnswerFirstCallChain } from "./call-chain.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "./contracts.ts";
import { automationStudioAnswerFirstFinish } from "./ending.ts";
import { automationStudioAnswerFirstFlowStage } from "./flow-stage.ts";
import { automationStudioAnswerFirstKeep } from "./keep.ts";
import { automationStudioAnswerFirstRecordOpening } from "./opening-row.ts";
import { automationStudioAnswerFirstOpening } from "./opening.ts";
import { automationStudioAnswerFirstUnboundedPort, automationStudioAnswerFirstWatchKeyWaits } from "../person-waits/index.ts";
import { automationStudioAnswerFirstAttemptPorts } from "./ports.ts";
import { automationStudioAnswerFirstRoundNote } from "./round-note.ts";
import { automationStudioAnswerFirstRounds, type AutomationStudioAnswerFirstRoundsEnding } from "./rounds.ts";
import { automationStudioAnswerFirstSay } from "./say.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";
import { automationStudioAnswerFirstHoldAnswer } from "./stop-answer.ts";

export async function runAutomationStudioAnswerFirstAttempt(given: AutomationStudioAnswerFirstAttemptInput): Promise<AutomationStudioGenerateFlowBootstrapAdaptationAnswered> {
  // The library is offered here, once, before anything runs: no part that can be offered leaves `given` as it is (`../../project-parts/known-parts.ts`).
  // A caller's grant and person port, where it brought them (`../caller/applied.ts`); a chat attempt's input is left as it is.
  const input = automationStudioAnswerFirstCallerApplied(await automationStudioAnswerFirstKnownParts(given));
  if (!input.binding?.tools.length) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.evidence_runtime_unavailable");
  const held = automationStudioAnswerFirstCarryOnScope.getStore();
  const hold = held && !held.opened && held.projectId === input.projectId && held.flowId === input.flowId ? held : undefined;
  const pressed = automationStudioAnswerFirstRunAgainScope.getStore();
  const again = !hold && pressed && !pressed.opened && pressed.projectId === input.projectId && pressed.flowId === input.flowId ? pressed : undefined;
  const attemptId = hold?.attemptId ?? again?.attemptId ?? `attempt.${randomUUID()}`;
  const live = automationStudioAnswerFirstLiveAttemptsOf(input.owner);
  live.claim(attemptId);
  let opening: AutomationStudioAnswerFirstAttemptRun | undefined;
  try {
    const run = await opened(input, attemptId, hold, again);
    opening = run;
    automationStudioAnswerFirstKeepBackJudge(input.creation.purse);
    // On the row before anything is sent, so the first round shows as working and a Core that dies in it leaves something to read as cut off. A carry-on's press has already written its own.
    if (!hold) await automationStudioAnswerFirstKeep(run);
    // The common path's purse is opened as a repair's, whose part it would write: this is an attempt's creation.
    const ending = await automationStudioLlmStepLogScope.within({ part: "creation" }, () => stagedThenRounds(run));
    if (ending === "setup_needed") {
      await endedUntried(run, hold);
      throw run.setupRefusal;
    }
    const answer = await automationStudioAnswerFirstFinish(run, ending);
    automationStudioAnswerFirstHoldAnswer(input.request, answer);
    return answer;
  } finally {
    opening?.keyWaits?.stop();
    live.release(attemptId);
  }
}

/** The saved Flow's run where there is one, then the rounds if that did not end it. */
async function stagedThenRounds(run: AutomationStudioAnswerFirstAttemptRun): Promise<AutomationStudioAnswerFirstRoundsEnding | "setup_needed"> {
  const ended = await automationStudioAnswerFirstFlowStage(run);
  return ended ?? await automationStudioAnswerFirstRounds(run, automationStudioAnswerFirstRoundNote(run, undefined));
}

/** Nothing was tried, so nothing is kept of it but the session it opened, which says so. A session not written costs that record, and the person is still told what to do. A carry-on tried nothing either: its press hands the row back as it was (`../carry-on/carry-on.ts`). */
async function endedUntried(run: AutomationStudioAnswerFirstAttemptRun, hold: AutomationStudioAnswerFirstCarryOnHold | undefined): Promise<void> {
  if (hold) hold.opened = false;
  else {
    await automationStudioAnswerFirstBestEffort(() => run.memory.update(run.input.projectId, run.taskId, (current) => ({ ...current, attempts: current.attempts.filter((each) => each.attemptId !== run.attemptId) })));
    // The row written at the opening: nothing was tried, so it must not outlive this as an attempt that was cut off.
    await automationStudioAnswerFirstBestEffort(() => run.store.remove(run.input.projectId, run.input.flowId, run.attemptId));
  }
  try {
    await run.session.end("cancelled");
  } catch {
    automationStudioAnswerFirstSay("Part of the record was not written", "Nothing was done, but part of what goes with that could not be written down.");
  }
}

async function opened(input: AutomationStudioAnswerFirstAttemptInput, attemptId: string, hold: AutomationStudioAnswerFirstCarryOnHold | undefined, again: AutomationStudioAnswerFirstRunAgainHold | undefined): Promise<AutomationStudioAnswerFirstAttemptRun> {
  const { projectId, flowId, stores, cancellation } = input;
  if (hold) hold.opened = true;
  if (again) again.opened = true;
  const runId = `explore.${randomUUID()}`;
  const store = automationStudioAnswerFirstAttemptStoreOf(input.owner, stores);
  const acts = automationStudioAnswerFirstRunActStoreOf(input.owner, stores);
  const carried = hold ? automationStudioAnswerFirstCarriedOpening(hold) : undefined;
  const opening = hold && carried
    ? { taskId: hold.taskId, memory: automationStudioAnswerFirstTaskMemoryOf(input.owner, stores), route: carried.route, ordinal: carried.ordinal, steps: carried.steps, seed: hold.acts, seedFrom: attemptId, actsHeldHere: true, startedFrom: carried.startedFrom, setAside: hold.kept?.acts?.attemptId === attemptId ? hold.kept.acts.earlier : undefined, humanness: hold.kept?.humanness }
    : await automationStudioAnswerFirstOpening(input, { store: automationStudioAnswerFirstAttemptsRead(input.owner, stores), acts }, again);
  // The instruction is the person's: Core refuses to save or count one written from a command's argument (`../../flow-bootstrap-commands/save-goal.ts`, `../../instruction-led/task.ts`).
  const asked = automationStudioAnswerFirstAskedRepeats(input.instructionText);
  // The same answer as the loop's `askedRepeats` (`./round.ts`), so the record and the detector agree on how many of one act the person asked for.
  // The Flow's store must take it, since a press with no record of it is refused; the task's memory is what outlives another task on this Flow, and a write it misses is made by the next.
  const persist = async (data: AutomationStudioAttemptActRecordData): Promise<void> => {
    await acts.save(projectId, flowId, data);
    await automationStudioAnswerFirstBestEffort(() => opening.memory.update(projectId, opening.taskId, (current) => ({ ...current, acts: { attemptId, flowId, data, ...(opening.setAside ? { earlier: opening.setAside } : {}) } })));
  };
  const record = new AutomationStudioAttemptActRecord({ ...(opening.seed ? { seed: opening.seed } : {}), persist, asked: () => asked(run.claim) });
  input.partActs?.use(record);
  const tried = automationStudioLlmLoopAttemptRecord(carried?.tried);
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
    // The columns the person named are the result's, and no others (`../rows/row-sink.ts`, run-mwb2kkv5-1baeee11).
    instructionText: input.instructionText,
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
  // Carried acts come with the before reading taken ahead of them, held in memory and never beside the Flow (`../witnesses/before-readings.ts`).
  const befores = automationStudioAnswerFirstBeforeReadingsOf(input.owner);
  const earlier = automationStudioAnswerFirstEarlierBefore(befores, { acts: opening.seed !== undefined, from: opening.seedFrom, sameAttempt: hold !== undefined });
  const witnesses = automationStudioAnswerFirstWitnesses({ read: async () => (await lookNow())?.view as JsonObject | undefined, earlier, keep: (before) => befores.keep(attemptId, before) });
  // What the model's own looks found after the first lasting act: the chain hands each new one on, the check bounds, screens and judges it (`./call-chain.ts`).
  const looked: { where: string; found: string }[] = [];
  const completion = automationStudioAnswerFirstCompletionCheck({
    instructions: input.instructionText,
    rows: () => sink.readBack(),
    readsRan: () => sink.readsAnswered() > 0,
    acts: () => record.acts(),
    endView: async () => (await automationStudioAnswerFirstEndViewRead(lookNow)).view,
    witnesses: () => witnesses.readings(),
    looked: () => looked,
    readPages: () => sink.readPages(),
    askedAgain: again !== undefined || carried?.askedAgain === true,
    purse: input.creation.purse,
    say: automationStudioAnswerFirstSay,
    ...(carried?.result ? { seed: { timesChecked: carried.result.timesChecked } } : {}),
    // A caller's own check and judge mode (`../completion/check.ts`); a chat attempt has the judge alone.
    ...(input.caller ? { confirm: { judge: input.caller.judge ?? "auto", check: input.caller.check } } : {}),
    // A replay of the saved Flow that ran exactly as its judged whole run is accepted on its record; any deviation is judged (`../completion/replay-stands.ts`).
    replay: () => automationStudioAnswerFirstReplayOf(run),
    judge: (summary) => automationStudioFlowLessJudge({
      personHeldMs: () => run.keyWaits?.heldMs() ?? run.waitedMs,
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
  // A caller's scope, held before anything in the chain (`../caller/scope-gate.ts`); with none, the chain as it was.
  const chain = automationStudioAnswerFirstScopeGate(input.caller?.scope, automationStudioAnswerFirstCallChain({
    domain: (call) => run.options.executeTool(call),
    record, sink, witnesses,
    readRowsKey: input.binding?.readRowsKey,
    describe: describe ? (call) => describe({ projectId, flowId, ...call }) : undefined,
    stepped: () => { run.liveSteps += 1; },
    answered: () => { run.arrived = true; },
    looked: (look) => { looked.push(look); }
  }));
  const ground = input.permissionGround;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    ...ground,
    ask: ground.ask ? {
      ...ground.ask,
      // Any wait at all makes the gate wait; the port takes the clock off it (`../person-waits/person-wait.ts`).
      timeoutMs: AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS,
      port: automationStudioAnswerFirstUnboundedPort(ground.ask.port, (state, waited) => {
        run.waitingFor = state === "started" ? "permission" : undefined;
        run.waitedMs += waited;
        void automationStudioAnswerFirstKeep(run);
      })
    } : undefined,
    executeTool: cancellation.tool(chain)
  });
  const now = Date.now();
  // A carried-on attempt that has been on the site goes on from the page as it stands, and only one that never got there goes to the start location.
  const arrived = (carried?.prior.liveSteps ?? 0) > 0;
  const run: AutomationStudioAnswerFirstAttemptRun = {
    input, ports: automationStudioAnswerFirstAttemptPorts(input.owner), store, memory: opening.memory,
    taskId: opening.taskId, route: opening.route, startedFrom: opening.startedFrom, startedWith: carried?.startedWith ?? opening.steps, path: carried?.path ?? "explore", decidedAfterRun: carried?.decidedAfterRun ?? false, forwardPassed: new Set(), askedAgain: again !== undefined || carried?.askedAgain === true,
    attemptId, ordinal: opening.ordinal, runId, startedAtMs: carried?.startedAtMs ?? now, segmentStartedAtMs: now, ...(carried ? { prior: carried.prior } : {}),
    record, tried, asked, sink, session: ending, witnesses, completion, permissions, options: arrived ? input.continuingOptions() : input.harnessOptions,
    steps: [...opening.steps], usage: { estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    liveSteps: carried?.prior.liveSteps ?? 0, arrived, loopsCaught: carried?.loopsCaught ?? automationStudioTaskAttemptNoLoopsCaught(), backoffs: 0, waitedMs: 0, askPerson: false
  };
  // The Flow holds one record, and from here it reads as this attempt's: without this, one that presses nothing would leave an earlier attempt's acts to be read as its own.
  if (opening.seed || opening.actsHeldHere || again) await automationStudioAnswerFirstBestEffort(() => persist(record.data()));
  if (carried) await carriedOn(run, carried);
  else await automationStudioAnswerFirstRecordOpening(run);
  // A task with no level of its own, on a Flow with none either, starts from the person's starting value (the request's), once.
  // A Flow's level is the task's until someone sets the task's own, so with one nothing is stored; a level the task has, set by
  // the person or taken at an earlier attempt, is never replaced. A write it misses is made by the next attempt.
  const startingValue = input.humanness;
  if (startingValue !== undefined && opening.humanness === undefined) {
    // A Flow that cannot be read has no level to follow, so the starting value is stored as it always was.
    const flow = await automationStudioAnswerFirstBestEffort(() => automationStudioAnswerFirstFlowRunEngineOf(input).parentFlow());
    const flowLevel = flow.ok ? automationStudioFlowHumanness(flow.value.metadata) : undefined;
    if (flowLevel === undefined) {
      await automationStudioAnswerFirstBestEffort(() => opening.memory.update(projectId, opening.taskId, (current) => (current.humanness === undefined ? { ...current, humanness: startingValue } : current)));
    }
  }
  run.keyWaits = automationStudioAnswerFirstWatchKeyWaits({ run, provider: input.provider.provider, keep: () => void automationStudioAnswerFirstKeep(run) });
  return run;
}

/** What only a carried-on attempt does at its opening: it still has what it said and the rows it found, and its row says so at once. */
async function carriedOn(run: AutomationStudioAnswerFirstAttemptRun, carried: AutomationStudioAnswerFirstCarriedOpening): Promise<void> {
  const { projectId, stores } = run.input;
  const { datasets } = stores;
  const { state } = run.completion;
  state.answerText = carried.result?.answerText?.text;
  state.checkedWhat = carried.result?.checkedWhat;
  const lastRun = carried.runId;
  const copied = await automationStudioAnswerFirstCopyRows({
    sink: run.sink,
    shown: carried.result?.rows,
    stored: datasets.available && lastRun !== undefined ? {
      runId: lastRun,
      list: () => datasets.listRunDatasetsForVerification({ projectId, runId: lastRun }),
      page: ({ datasetId, limit, cursor }) => datasets.getRunDatasetPage({ projectId, runId: lastRun, datasetId, limit, ...(cursor === undefined ? {} : { cursor }) })
    } : undefined
  });
  if (!copied.ok) automationStudioAnswerFirstSay("Part of the record was not written", "I am carrying on, but some of the rows found so far could not be brought along. I will read them again if I need them.");
  automationStudioAnswerFirstSay("Carrying on", "Carrying on from where it got to.");
  await automationStudioAnswerFirstKeep(run);
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
