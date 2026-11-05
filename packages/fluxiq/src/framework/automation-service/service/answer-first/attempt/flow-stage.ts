// A later attempt's first stage: the saved Flow, run live and judged, before any round (design,
// "The shape"). A whole run judged yes is the result, with no exploration at all. Anything else
// goes on to the rounds, told what happened, from the page the run left. Only a person's Stop or
// an emptied purse ends the attempt here, as they would anywhere else.
//
// **The before-state first.** The change is what is judged, so the witness is read before the
// engine runs whenever a saved step declares something lasting; the engine's acts pass no call
// chain to read it for them.
//
// **The look after a run stays where the run left the page.** The tools the attempt opened with
// go to the start location, which would take the judge's last look somewhere else.
//
// **A run that sent nothing did not happen**, whether a person said no, the steps could not be
// assembled or the engine would not start: the attempt is an exploration, as it would have been.
//
// **A failure here never stops a task.** Whatever is thrown leaves the rounds to go on.
//
// **A carried-on attempt never comes here**: the Flow is never run again from its start.
//
// **A person's Run again runs it with no state checked first** (`../run-again/`): the steps as they
// were written, since what Core added to them is its bias against repeating, and that press says repeat.
//
// **The row is written once the first step goes out**, so a process that dies mid-run leaves an
// attempt that can be seen and carried on. Not before: a run that sent nothing did not happen.

import { automationStudioFlowDraftDeclaresLasting, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstFlowRun, automationStudioAnswerFirstFlowRunEngineOf } from "../flow-run/index.ts";
import type { AutomationStudioAnswerFirstSavedFlow } from "../task-memory/index.ts";
import { automationStudioAnswerFirstBestEffort } from "./best-effort.ts";
import { automationStudioAnswerFirstKeep } from "./keep.ts";
import type { AutomationStudioAnswerFirstRoundsEnding } from "./rounds.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

type FlowRun = NonNullable<AutomationStudioAnswerFirstAttemptRun["flowRun"]>;

/** What a completion by a whole run says of itself: the check reads no more of it than its answer and notes, and it has neither. */
const WHOLE_RUN = "The saved Flow ran from its start to its end.";

/** The stage's ending, or nothing where the rounds go on. Never throws. */
export async function automationStudioAnswerFirstFlowStage(run: AutomationStudioAnswerFirstAttemptRun): Promise<AutomationStudioAnswerFirstRoundsEnding | undefined> {
  const { route } = run;
  if (route.kind !== "use" || run.prior || run.input.creation.purse.ceilingUsd <= 0) return undefined;
  const staged = await automationStudioAnswerFirstBestEffort(() => stage(run, run.askedAgain ? { steps: route.saved.steps, stepsDigest: route.saved.stepsDigest } : route.saved));
  if (staged.ok) return staged.value;
  run.path = run.flowRun?.wentOut ? "run_flow_then_repair" : "explore";
  return undefined;
}

async function stage(run: AutomationStudioAnswerFirstAttemptRun, saved: Pick<AutomationStudioAnswerFirstSavedFlow, "steps" | "stepsDigest" | "stated">): Promise<AutomationStudioAnswerFirstRoundsEnding | undefined> {
  const { input } = run;
  if (saved.steps.some(declaresLasting)) await run.witnesses.beforeFirstLastingAct();
  const sentBefore = run.liveSteps;
  run.path = "run_flow";
  const outcome = await automationStudioAnswerFirstFlowRun({
    input, runId: run.runId, record: run.record, sink: run.sink, permissions: run.permissions,
    stepped: () => {
      run.liveSteps += 1;
      if (run.liveSteps === sentBefore + 1) void automationStudioAnswerFirstKeep(run);
    },
    arrived: () => { run.arrived = true; },
    engine: () => automationStudioAnswerFirstFlowRunEngineOf(input)
  }, saved);
  const flowRun: FlowRun = { outcome, wentOut: run.liveSteps > sentBefore };
  run.flowRun = flowRun;
  if (run.arrived) run.options = input.continuingOptions();
  await automationStudioAnswerFirstKeep(run);
  if (outcome.kind === "ran" && outcome.reachedEnd) await judged(run, flowRun);
  const ending = endedBy(run);
  if (ending) return ending;
  run.path = flowRun.wentOut ? "run_flow_then_repair" : "explore";
  await automationStudioAnswerFirstKeep(run);
  return undefined;
}

/** One Flow-less judge call on what the run left. A refusal by the purse says so on the check's state, which `endedBy` reads. */
async function judged(run: AutomationStudioAnswerFirstAttemptRun, flowRun: FlowRun): Promise<void> {
  const { check, state } = run.completion;
  await automationStudioAnswerFirstBestEffort(() => check({ summary: WHOLE_RUN }));
  if (state.achieved) flowRun.judged = "yes";
  else if (state.refused) flowRun.judged = state.refused.verdict;
  if (flowRun.judged === "no") run.sink.runRowsRefused();
}

function endedBy(run: AutomationStudioAnswerFirstAttemptRun): AutomationStudioAnswerFirstRoundsEnding | undefined {
  if (run.input.cancellation.signal()?.aborted === true) return "stopped_by_person";
  if (run.completion.state.achieved) return "achieved";
  return run.completion.state.purseRefused || run.input.creation.purse.refusal !== undefined ? "budget_out" : undefined;
}

function declaresLasting(step: AutomationStudioFlowDraftStep): boolean {
  const nested = step.input.parameters;
  const inner = typeof nested === "object" && nested !== null && !Array.isArray(nested) ? nested.consequences : undefined;
  return automationStudioFlowDraftDeclaresLasting(step.input.consequences) || automationStudioFlowDraftDeclaresLasting(inner);
}
