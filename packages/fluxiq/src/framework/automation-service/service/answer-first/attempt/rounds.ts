// The rounds of one attempt, driven by the keep-going table (plan, "Keep Going Until The Result"):
// a result judged achieved, a budget gone or a person's Stop ends them, and nothing else.
//
// A fresh round keeps the draft, the act record, the tried record and the rows, and tells the
// model what landed and what it already tried, from the page as it stands.
//
// **It never spins.** A round that spent nothing bought nothing, and starting another at once
// would turn a fault nothing can fix into a tight loop nothing bounds, since the purse only
// counts what is spent. So it waits by the same schedule as a silence, where a Stop still works.
//
// **A person-only check with nobody to ask** is the one way out short of an ending: without a
// thread, nobody can clear it and every round would meet it again. The attempt stays
// `waiting_for_person`, honestly, with what it has, and returns.
//
// **A refusal before any model call** (`../../../../../runtime/answer-first/pre-model/`) has spent
// nothing and tried nothing, so no attempt has really started: one a fresh round cannot change is
// a setup step, `../setup/`'s to say. Once anything is spent it stays a fresh round, as anything
// else would be, since the only endings past that point are the three above.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstBackoff, automationStudioAnswerFirstNext, type AutomationStudioAnswerFirstRoundEnd } from "../../../../../runtime/answer-first/keep-going/index.ts";
import { automationStudioAnswerFirstPreModelStep, type AutomationStudioAnswerFirstPreModelStep } from "../../../../../runtime/answer-first/pre-model/index.ts";
import { automationStudioActivityAskPort } from "../../../../../runtime/automation-activity/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../../../runtime/flow-authoring/bootstrap/generation-failure/index.ts";
import { automationStudioAnswerFirstUnboundedPort } from "../person-waits/index.ts";
import { automationStudioAnswerFirstKeep } from "./keep.ts";
import { automationStudioAnswerFirstRound } from "./round.ts";
import { automationStudioAnswerFirstRoundNote } from "./round-note.ts";
import { automationStudioAnswerFirstSay } from "./say.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";
import { automationStudioAnswerFirstAskStuck } from "./stuck-ask.ts";

/** How the rounds ended: an ending, or the one wait nothing here can end. */
export type AutomationStudioAnswerFirstRoundsEnding = "achieved" | "budget_out" | "stopped_by_person" | "waiting_for_check";

/** Rounds in a row that spent nothing, on a refusal before any model call, before it is a setup step: a fresh round could not get past it. */
const REFUSED_ROUNDS_BEFORE_SETUP = 3;

/** The rounds, to their ending; or `setup_needed`, with `run.setupRefusal` set, where no model call was ever made. */
export async function automationStudioAnswerFirstRounds(run: AutomationStudioAnswerFirstAttemptRun, firstNote?: JsonObject): Promise<AutomationStudioAnswerFirstRoundsEnding | "setup_needed"> {
  const { input } = run;
  const purse = input.creation.purse;
  if (purse.ceilingUsd <= 0) return "budget_out";
  let note = firstNote;
  let idleRounds = 0;
  for (let ordinal = 1; ; ordinal += 1) {
    const spentBefore = purse.spentCalls();
    const end = await automationStudioAnswerFirstRound(run, { ordinal, note });
    const next = automationStudioAnswerFirstNext({ end, aborted: stopped(run), purseRefused: run.completion.state.purseRefused || purse.refusal !== undefined, achieved: run.completion.state.achieved, backoffs: run.backoffs });
    if (next.kind === "achieved") return "achieved";
    if (next.kind === "budget_out") return "budget_out";
    if (next.kind === "stopped") return "stopped_by_person";
    if (run.personEnded === "unreachable") return "waiting_for_check";
    const refused = refusedBeforeModel(end);
    if (refused?.step.does === "resolve" && refused.step.by === "budget_out") return "budget_out";
    // A saved Flow's run has acted on the site, so what it did is kept and told, as anything spent would be.
    if (refused && !run.flowRun?.wentOut && purse.spentCalls() === 0 && (refused.step.does === "setup" || idleRounds + 1 >= REFUSED_ROUNDS_BEFORE_SETUP)) {
      run.setupRefusal = refused.error;
      return "setup_needed";
    }
    // A refusal with nothing spent has nothing to keep, and a row written now would outlive a setup step as an attempt forever working.
    if (!refused || purse.spentCalls() > 0) await automationStudioAnswerFirstKeep(run);
    if (next.kind === "backoff") {
      automationStudioAnswerFirstSay("Waiting for the model service", next.say);
      run.backoffs += 1;
      await wait(run, next.waitMs);
      continue;
    }
    if (run.askPerson && await askedToStop(run)) return "stopped_by_person";
    idleRounds = purse.spentCalls() === spentBefore ? idleRounds + 1 : 0;
    if (idleRounds > 0) await wait(run, automationStudioAnswerFirstBackoff(idleRounds - 1).waitMs);
    if (stopped(run)) return "stopped_by_person";
    automationStudioAnswerFirstSay("Carrying on", next.why);
    // A fresh round is no longer a repair of the step the Flow stopped at (`./path.ts`).
    if (run.path === "run_flow_then_repair") run.path = "run_flow_then_explore";
    note = automationStudioAnswerFirstRoundNote(run, next.note);
  }
}

/** A round that threw a refusal made before any model call, and what the table says it becomes (`../../../../../runtime/answer-first/pre-model/`). */
function refusedBeforeModel(end: AutomationStudioAnswerFirstRoundEnd): { error: unknown; step: AutomationStudioAnswerFirstPreModelStep } | undefined {
  if (end.kind !== "thrown") return undefined;
  const code = parseAutomationStudioFlowBootstrapGenerationError(end.error)?.code;
  const step = code === undefined ? undefined : automationStudioAnswerFirstPreModelStep(code);
  return step ? { error: end.error, step } : undefined;
}

/** A person's Stop, however it came: the build's cancellation, or their answer to a check. */
function stopped(run: AutomationStudioAnswerFirstAttemptRun): boolean {
  return run.input.cancellation.signal()?.aborted === true || run.personEnded === "stopped" || run.personEnded === "cancelled";
}

async function wait(run: AutomationStudioAnswerFirstAttemptRun, ms: number): Promise<void> {
  run.waitedMs += ms;
  await run.ports.sleep(ms, run.input.cancellation.signal());
}

/** Loop detection's last rung: stop spending and ask (`./stuck-ask.ts`). True when the person said to stop. */
async function askedToStop(run: AutomationStudioAnswerFirstAttemptRun): Promise<boolean> {
  run.askPerson = false;
  run.waitingFor = "stuck_in_a_loop";
  await automationStudioAnswerFirstKeep(run);
  const { personAsk, cancellation } = run.input;
  const port = personAsk ? automationStudioActivityAskPort(automationStudioAnswerFirstUnboundedPort(personAsk.port, (_state, waited) => { run.waitedMs += waited; }), "building") : undefined;
  const answer = await automationStudioAnswerFirstAskStuck(port, cancellation.signal());
  run.waitingFor = undefined;
  return answer === "stop";
}
