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
// **A stuck attempt is steered, never parked (R7, run-mwc6ut8u-52e3c1b3).** At loop detection's
// last rung the round has already ended. The attempt used to park there (`stuck_in_a_loop`) until
// a person answered "keep going or stop", and three live runs sat parked until their proof gave
// up. Now the next round starts at once, steered onto a different way: its note says the loop
// was stopped, what was tried, and to take another way (`../loop-signal/stuck-steer.ts`), and the
// record counts a fresh start. Where a person can be asked, the same moment posts them a real
// question, built from the loop's own evidence (`./stuck-ask.ts`,
// `../loop-signal/stuck-question.ts`), and never waits for it. Their words, whenever they come,
// go on the attempt (`personSaid`) and every later round is told them as guidance
// (`./round-note.ts`). With nobody to ask, the attempt steers in the same way and posts nothing.
// Only the result, the budget or the person's Stop ends it.
//
// **A saved step run again runs with this attempt's inputs.** A caller's input values become each
// bound step's default before the first round, since a round's own run of saved steps resolves them
// against no inputs (`../flow-run/input-valued-steps.ts`).
//
// **A refusal before any model call** (`../../../../../runtime/answer-first/pre-model/`) has spent
// nothing and tried nothing, so no attempt has really started: one a fresh round cannot change is
// a setup step, `../setup/`'s to say. Once anything is spent it stays a fresh round, as anything
// else would be, since the only endings past that point are the three above.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstBackoff, automationStudioAnswerFirstNext, type AutomationStudioAnswerFirstRoundEnd } from "../../../../../runtime/answer-first/keep-going/index.ts";
import { automationStudioAnswerFirstPreModelStep, type AutomationStudioAnswerFirstPreModelStep } from "../../../../../runtime/answer-first/pre-model/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../../../runtime/flow-authoring/bootstrap/generation-failure/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS, automationStudioAnswerFirstResultHolds } from "../completion/index.ts";
import { automationStudioAnswerFirstInputValuedSteps } from "../flow-run/index.ts";
import { automationStudioAnswerFirstStuckQuestion, automationStudioAnswerFirstStuckSteer } from "../loop-signal/index.ts";
import { automationStudioAnswerFirstKeep } from "./keep.ts";
import { automationStudioAnswerFirstRound } from "./round.ts";
import { automationStudioAnswerFirstRoundNote } from "./round-note.ts";
import { automationStudioAnswerFirstSay } from "./say.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";
import { automationStudioAnswerFirstStuckAsking, type AutomationStudioAnswerFirstStuckAsking } from "./stuck-ask.ts";

/** How the rounds ended: an ending, or the one wait nothing here can end. `taken_unverified` is a caller's result taken unchecked, its judge off and no check (`../completion/check.ts`): a result, never a failure. */
export type AutomationStudioAnswerFirstRoundsEnding = "achieved" | "taken_unverified" | "budget_out" | "stopped_by_person" | "waiting_for_check";

/** Rounds in a row that spent nothing, on a refusal before any model call, before it is a setup step: a fresh round could not get past it. */
const REFUSED_ROUNDS_BEFORE_SETUP = 3;

/** The rounds, to their ending; or `setup_needed`, with `run.setupRefusal` set, where no model call was ever made. */
export async function automationStudioAnswerFirstRounds(run: AutomationStudioAnswerFirstAttemptRun, firstNote?: JsonObject): Promise<AutomationStudioAnswerFirstRoundsEnding | "setup_needed"> {
  const { input } = run;
  const purse = input.creation.purse;
  if (purse.ceilingUsd <= 0) return "budget_out";
  // A saved step a round runs again takes this attempt's input values, not those the Flow was learned with (`../flow-run/input-valued-steps.ts`).
  const inputs = input.caller?.inputs;
  if (inputs) {
    run.steps = automationStudioAnswerFirstInputValuedSteps(run.steps, inputs);
    run.startedWith = automationStudioAnswerFirstInputValuedSteps(run.startedWith, inputs);
  }
  // The stuck question, posted and never waited on; closed however the rounds end (`./stuck-ask.ts`).
  const asking = automationStudioAnswerFirstStuckAsking({
    port: input.personAsk?.port,
    signal: input.cancellation.signal(),
    heard: (words) => {
      (run.personSaid ??= []).push(words);
      automationStudioAnswerFirstSay("Got your answer", HEARD);
    },
    failed: () => automationStudioAnswerFirstSay("Could not reach you", UNREACHED)
  });
  try {
    return await rounds(run, asking, firstNote);
  } finally {
    await asking.close();
  }
}

/** Said when the person's answer arrives: later rounds follow it. */
const HEARD = "FluxIQ will follow what you said from its next step on.";
/** Said when the question could not be posted or its answer read: the attempt goes on as it would have. */
const UNREACHED = "FluxIQ could not post its question to you or read your answer, so it carries on without it.";

async function rounds(run: AutomationStudioAnswerFirstAttemptRun, asking: AutomationStudioAnswerFirstStuckAsking, firstNote: JsonObject | undefined): Promise<AutomationStudioAnswerFirstRoundsEnding | "setup_needed"> {
  const purse = run.input.creation.purse;
  let note = firstNote;
  let idleRounds = 0;
  for (let ordinal = 1; ; ordinal += 1) {
    const spentBefore = purse.spentCalls();
    const end = await automationStudioAnswerFirstRound(run, { ordinal, note });
    const { achieved, takenUnverified } = run.completion.state;
    const next = automationStudioAnswerFirstNext({ end, aborted: stopped(run), purseRefused: run.completion.state.purseRefused || purse.refusal !== undefined, achieved: achieved || takenUnverified === true, backoffs: run.backoffs });
    if (next.kind === "achieved") return achieved ? "achieved" : "taken_unverified";
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
    // A refusal with nothing spent has nothing new to keep, and the row from the opening is taken back if it becomes a setup step.
    if (!refused || purse.spentCalls() > 0) await automationStudioAnswerFirstKeep(run);
    if (next.kind === "backoff") {
      automationStudioAnswerFirstSay("Waiting for the model service", next.say);
      run.backoffs += 1;
      await wait(run, next.waitMs);
      continue;
    }
    // Loop detection's last rung: steered onto a different way, never parked (header, R7).
    const steer = run.askPerson ? await steerStuck(run, asking) : undefined;
    idleRounds = purse.spentCalls() === spentBefore ? idleRounds + 1 : 0;
    if (idleRounds > 0) await wait(run, automationStudioAnswerFirstBackoff(idleRounds - 1).waitMs);
    if (stopped(run)) return "stopped_by_person";
    automationStudioAnswerFirstSay("Carrying on", next.why);
    // A fresh round is no longer a repair of the step the Flow stopped at (`./path.ts`).
    if (run.path === "run_flow_then_repair") run.path = "run_flow_then_explore";
    note = automationStudioAnswerFirstRoundNote(run, { ...next.note, ...refusedAgainNote(run), ...(steer ? { loopStopped: steer } : {}) });
  }
}

/** What a fresh round is told when its completion was refused over the same evidence: what would change that, and what the result holds. It points at the person's answer once there is one. */
function refusedAgainNote(run: AutomationStudioAnswerFirstAttemptRun): JsonObject {
  const { refusedAgain, held } = run.completion.state;
  if (refusedAgain === 0) return {};
  return {
    completionRefused: {
      words: AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS.freshRound((run.personSaid?.length ?? 0) > 0),
      ...(held ? { resultHolds: automationStudioAnswerFirstResultHolds(held, run.input.binding?.deniedEvidenceKeys ?? []) } : {})
    }
  };
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

/**
 * Loop detection's last rung (header, R7): a fresh start on the record, the person asked where
 * they can be and no question of theirs is still open, and the steer the next round is told. It
 * never waits and never parks.
 */
async function steerStuck(run: AutomationStudioAnswerFirstAttemptRun, asking: AutomationStudioAnswerFirstStuckAsking): Promise<JsonObject> {
  run.askPerson = false;
  // The question says what was tried so far; the fresh start it announces goes on the record after it.
  const posted = await asking.post(stuckQuestion(run));
  run.tried.approachChanged();
  run.stuck = undefined;
  automationStudioAnswerFirstSay("Trying a different way", posted ? STEERED_ASKED : STEERED);
  return automationStudioAnswerFirstStuckSteer(asking.open());
}

/** Said as the attempt steers itself: what it does, in the person's words. */
const STEERED = "FluxIQ kept repeating itself, so it stopped that and is trying a different way.";
const STEERED_ASKED = "FluxIQ kept repeating itself, so it stopped that and is trying a different way. It has asked you a question in case you can help, and carries on meanwhile.";

/** The person's question, from what the last rung stopped on and what the attempt has tried and holds (`../loop-signal/stuck-question.ts`). */
function stuckQuestion(run: AutomationStudioAnswerFirstAttemptRun): string {
  const { held, answerText } = run.completion.state;
  return automationStudioAnswerFirstStuckQuestion({
    stuck: run.stuck ?? { finding: { pattern: "exact_repeat", repeats: 0, unchanged: [] } },
    caught: run.loopsCaught,
    tried: run.tried.data(),
    held: { rows: held?.rows.totalRows ?? run.sink.summary().totalRows, acts: held?.acts ?? run.record.acts().length, answered: answerText !== undefined }
  });
}
