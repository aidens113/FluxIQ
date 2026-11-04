// One round: one evidence loop, with dry run off, no trial port, no reset and no supervisor, and
// the draft on with the model authoring (D1). It runs until the loop ends, however it ends, and
// hands the keep-going table what happened (`./rounds.ts`). Limits here bound a round, never
// the task.
//
// A round holds nothing the next one needs but what is on the attempt: its seed is the draft
// the last one left, read off each decision (`draft.acts`), so a loop that threw loses at most
// the step it was on, and its opening look goes where the page stands. Only the arrival's tools
// go to the start location, until the page has got there.
//
// The completion check sits outside the observer, as a candidate's does: the observer's
// completion note is a build's ("it still has to run cleanly"), and this says its own check.

import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAttemptActForward } from "../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstSystemInstructions } from "../../../../../runtime/answer-first/guidance/index.ts";
import type { AutomationStudioAnswerFirstRoundEnd } from "../../../../../runtime/answer-first/keep-going/index.ts";
import { automationStudioActivityAskPort, observeAutomationStudioEvidenceLoop } from "../../../../../runtime/automation-activity/index.ts";
import { automationStudioPersonNeededToolCalls } from "../../../../../runtime/automation-parking/index.ts";
import { automationStudioInstructedActs } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { automationStudioFlowDraftStepCopy } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowBootstrapDraftActs, automationStudioFlowDraftReplayClearedCode, automationStudioLlmProviderWithDomainInstructions, automationStudioNodeReplayStatus, runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceLoopResult } from "../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA } from "../completion/index.ts";
import { automationStudioAnswerFirstAddLoopsCaught, automationStudioAnswerFirstLoopSignal } from "../loop-signal/index.ts";
import { automationStudioAnswerFirstDecide } from "./decide.ts";
import { automationStudioAnswerFirstKeep } from "./keep.ts";
import { automationStudioAnswerFirstUnboundedPort } from "./person-wait.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

/** The loop's guard stopped the round: it holds the rows the round wrote, as a failure would. */
class AutomationStudioAnswerFirstRoundStalled extends Error {
  readonly name = "AutomationStudioAnswerFirstRoundStalled";

  constructor(readonly trace: readonly { resultCode?: string | undefined; resultReason?: string | undefined }[]) {
    super("The round's guard stopped it.");
  }
}

/** What the table reads of a round the guard stopped: the same words as a loop that repeated itself. */
const STALLED: AutomationStudioAnswerFirstRoundEnd = { kind: "loop", result: { ok: false, code: "llm_evidence_loop.repeat_without_progress" } as AutomationStudioLlmEvidenceLoopResult };

/** Runs one round and says how it ended. Never throws: whatever happens is the table's to read. */
export async function automationStudioAnswerFirstRound(run: AutomationStudioAnswerFirstAttemptRun, round: { ordinal: number; note: JsonObject | undefined }): Promise<AutomationStudioAnswerFirstRoundEnd> {
  const { input } = run;
  const options = run.arrived ? input.continuingOptions() : input.harnessOptions;
  run.options = options;
  const person = automationStudioPersonNeededToolCalls({
    executeTool: run.permissions.executeTool,
    tools: options.tools,
    stage: "authoring",
    subject: "task",
    ...(input.personAsk ? { ask: { port: automationStudioActivityAskPort(automationStudioAnswerFirstUnboundedPort(input.personAsk.port, personWaiting(run)), "building") } } : {}),
    ...(input.cancellation.signal() ? { signal: input.cancellation.signal() } : {}),
    clearedResultCode: automationStudioFlowDraftReplayClearedCode,
    newAskId: () => `person-needed.${randomUUID()}`
  });
  const stop = input.cancellation.signal();
  const signal = AbortSignal.any([person.signal, ...(stop ? [stop] : [])]);
  const binding = input.binding!;
  const startLocation = run.arrived ? undefined : input.startLocation;
  const acts = automationStudioFlowBootstrapDraftActs({ instructionText: input.instructionText, startLocation: input.startLocation, arrival: binding.runsNodes?.arrival, registry: input.registry, resolution: input.resolution, route: input.authority.route, activeInstructions: input.activeInstructions });
  let lasting: Promise<ReadonlySet<string>> | undefined;
  const loop: AutomationStudioLlmEvidenceLoopInput = {
    ...input.limits.loop,
    // The purse's cost is what is told, and the only cost ending; a person's or a silence's wait is not the round's time.
    // No time limit: a build's nine minutes would only force a fresh round on real work, or one a locked key held. The purse, the turns and loop detection bound a round.
    budget: automationStudioAnswerFirstRoundBudget(input.limits.loop.budget, input.creation.purse.ceilingUsd),
    purse: input.creation.purse,
    tools: options.tools,
    observedStateKeys: options.observedStateKeys,
    ...(binding.readRowsKey ? { readRowsKey: binding.readRowsKey } : {}),
    deniedEvidenceKeys: binding.deniedEvidenceKeys,
    controlParameterKeys: input.controlParameterKeys,
    stepLogPageText: input.stepLogPageText,
    nodeOf: input.nodeDescriptions.definition,
    definitionOf: (id: string) => input.registry.get(id, input.resolution),
    ...(binding.describeCall ? { describeCall: (call: { toolId: string; value: JsonObject }) => binding.describeCall?.({ projectId: input.projectId, flowId: input.flowId, ...call }) } : {}),
    signal,
    propagateDecisionErrors: true,
    unusableDecisions: {
      maxConsecutive: input.limits.maxConsecutiveUnusableDecisions,
      stalled: ({ trace }) => new AutomationStudioAnswerFirstRoundStalled(trace)
    },
    dryRun: false,
    // One record across the attempt (t859), and how many of one act the person asked for: the request's number, whichever act the decision names.
    attemptRecord: run.tried,
    askedRepeats: (act) => run.asked(act.act),
    forwardRun: {
      ...automationStudioAttemptActForward(run.record),
      // How far forward runs got, for the attempt's path (`./path.ts`): a pass answered as one, whether it ran or checked a step already done.
      passed: (step, _row, answer) => {
        if (automationStudioNodeReplayStatus(answer.resultCode, "replay") === "replayed" || automationStudioNodeReplayStatus(answer.resultCode, "verify") === "replayed") run.forwardReached = Math.max(run.forwardReached, step.position);
      }
    },
    lastingActs: () => (lasting ??= run.permissions.instructedLastingActs(automationStudioInstructedActs(input.instructionText))),
    draft: {
      maxAmendments: input.limits.loop.maxIterations,
      ...(run.steps.length ? { seed: run.steps } : {}),
      acts: (steps) => {
        run.steps = steps.map((step) => automationStudioFlowDraftStepCopy(step));
        return acts.acts(steps);
      },
      actsMissing: acts.actsMissing,
      claimRefused: acts.claimRefused,
      ...(acts.route ? { route: acts.route } : {})
    },
    completionSchema: AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA,
    decide: automationStudioAnswerFirstDecide(run, {
      ordinal: round.ordinal,
      note: round.note,
      provider: automationStudioLlmProviderWithDomainInstructions(input.provider.provider, automationStudioAnswerFirstSystemInstructions(binding.systemInstructions)),
      startLocation
    }),
    executeTool: input.routing.recording(person.executeTool)
  };
  const signalled = automationStudioAnswerFirstLoopSignal({ askPerson: () => { run.askPerson = true; } });
  try {
    const result = await runAutomationStudioLlmEvidenceLoop({ ...observeAutomationStudioEvidenceLoop(loop), ...signalled, checkCompletion: (result) => checked(run, result) });
    run.steps = result.steps.map((step) => automationStudioFlowDraftStepCopy(step));
    automationStudioAnswerFirstAddLoopsCaught(run.loopsCaught, result.trace);
    return { kind: "loop", result };
  } catch (error) {
    if (!(error instanceof AutomationStudioAnswerFirstRoundStalled)) return { kind: "thrown", error };
    automationStudioAnswerFirstAddLoopsCaught(run.loopsCaught, error.trace);
    return STALLED;
  } finally {
    run.personEnded = person.ended();
  }
}

/** The completion check. A carried-on attempt's rows were copied in as a run's are, so a judge's no takes away their standing, as it does a run's: otherwise a wrong list found earlier would outrank the right one forever. */
async function checked(run: AutomationStudioAnswerFirstAttemptRun, result: JsonObject): ReturnType<AutomationStudioAnswerFirstAttemptRun["completion"]["check"]> {
  const answer = await run.completion.check(result);
  if (run.prior && run.completion.state.refused?.verdict === "no") run.sink.runRowsRefused();
  return answer;
}

function personWaiting(run: AutomationStudioAnswerFirstAttemptRun): (state: "started" | "ended", waitedMs: number) => void {
  return (state, waitedMs) => {
    run.waitingFor = state === "started" ? "person_only_check" : undefined;
    run.waitedMs += waitedMs;
    void automationStudioAnswerFirstKeep(run);
  };
}

/** A round's bounds: the attempt's purse, and no time limit (see the call). */
function automationStudioAnswerFirstRoundBudget(budget: AutomationStudioAnswerFirstAttemptRun["input"]["limits"]["loop"]["budget"], ceilingUsd: number): AutomationStudioAnswerFirstAttemptRun["input"]["limits"]["loop"]["budget"] {
  const { maxDurationMs: _noTimeLimit, ...bounds } = budget;
  return { ...bounds, maxCostUsd: Math.max(ceilingUsd, Number.MIN_VALUE) };
}
