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
// **A robot check is put to the person in place**, and the run goes on from that step once they
// press Continue; the attempt reads `waiting_for_person` / `person_only_check` while it stands.
//
// **A purse of nothing is replay only** (fluxnode-plan N5, a caller's `budgetUsd: 0`): the saved Flow
// still runs, since a run calls no model. A check of the caller's own, or checking turned off, can
// then end it with no model call at all; anything that needs one (a judge) meets the empty purse and
// ends `budget_out` with what the run read. A task with no saved Flow to run goes to the rounds, which
// end at once on the same purse (`./rounds.ts`), so nothing anywhere asks a model.
//
// **A carried-on attempt never comes here**: the Flow is never run again from its start.
//
// **A person's Run again runs it as any later attempt does, states checked first** (`../run-again/`):
// what it changes is the act record, which starts empty, so a count's add presses again. A control
// already in its asked-for state is checked and not pressed: a person who asked for it saved wants it
// saved, and a press that flipped it back would answer the opposite of what they asked.
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
  if (route.kind !== "use" || run.prior) return undefined;
  const staged = await automationStudioAnswerFirstBestEffort(() => stage(run, route.saved));
  if (staged.ok) return staged.value;
  run.path = run.flowRun?.wentOut ? "run_flow_then_repair" : "explore";
  return undefined;
}

async function stage(run: AutomationStudioAnswerFirstAttemptRun, saved: Pick<AutomationStudioAnswerFirstSavedFlow, "steps" | "stepsDigest" | "stated">): Promise<AutomationStudioAnswerFirstRoundsEnding | undefined> {
  const { input } = run;
  if (saved.steps.some(declaresLasting)) await run.witnesses.beforeFirstLastingAct();
  const sentBefore = run.liveSteps;
  let personStopped = false;
  run.path = "run_flow";
  // The task's own level as it stands now, a person's change since the attempt opened included; unread, it reads as none and the next source decides (`../flow-run/flow-run.ts`).
  const kept = await automationStudioAnswerFirstBestEffort(() => run.memory.get(input.projectId, run.taskId));
  const taskHumanness = kept.ok ? kept.value?.humanness : undefined;
  const outcome = await automationStudioAnswerFirstFlowRun({
    input, runId: run.runId, record: run.record, sink: run.sink, permissions: run.permissions,
    ...(taskHumanness !== undefined ? { storedHumanness: { task: taskHumanness } } : {}),
    stepped: () => {
      run.liveSteps += 1;
      if (run.liveSteps === sentBefore + 1) void automationStudioAnswerFirstKeep(run);
    },
    arrived: () => { run.arrived = true; },
    engine: () => automationStudioAnswerFirstFlowRunEngineOf(input),
    // A check only a person can clear is put to them on the Flow's thread, and the attempt says it waits for one while it stands (`../flow-run/person-check-port.ts`).
    ...(input.personAsk ? { personCheck: { port: input.personAsk.port, stopped: () => { personStopped = true; }, waiting: (state: "started" | "ended", waitedMs: number) => {
      run.waitingFor = state === "started" ? "person_only_check" : undefined;
      run.waitedMs += waitedMs;
      void automationStudioAnswerFirstKeep(run);
    } } } : {})
  }, saved);
  const flowRun: FlowRun = { outcome, wentOut: run.liveSteps > sentBefore };
  run.flowRun = flowRun;
  if (run.arrived) run.options = input.continuingOptions();
  await automationStudioAnswerFirstKeep(run);
  // Stop on a check is the person's Stop of the attempt: no judge call, no round, nothing more spent.
  if (personStopped) return "stopped_by_person";
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
  if (run.completion.state.takenUnverified) return "taken_unverified";
  return run.completion.state.purseRefused || run.input.creation.purse.refusal !== undefined ? "budget_out" : undefined;
}

function declaresLasting(step: AutomationStudioFlowDraftStep): boolean {
  const nested = step.input.parameters;
  const inner = typeof nested === "object" && nested !== null && !Array.isArray(nested) ? nested.consequences : undefined;
  return automationStudioFlowDraftDeclaresLasting(step.input.consequences) || automationStudioFlowDraftDeclaresLasting(inner);
}
