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

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstBackoff, automationStudioAnswerFirstNext } from "../../../../../runtime/answer-first/keep-going/index.ts";
import { automationStudioActivityAskPort } from "../../../../../runtime/automation-activity/index.ts";
import { automationStudioAnswerFirstUnboundedPort } from "./person-wait.ts";
import { automationStudioAnswerFirstKeep } from "./keep.ts";
import { automationStudioAnswerFirstRound } from "./round.ts";
import { automationStudioAnswerFirstSay } from "./say.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";
import { automationStudioAnswerFirstAskStuck } from "./stuck-ask.ts";

/** How the rounds ended: an ending, or the one wait nothing here can end. */
export type AutomationStudioAnswerFirstRoundsEnding = "achieved" | "budget_out" | "stopped_by_person" | "waiting_for_check";

export async function automationStudioAnswerFirstRounds(run: AutomationStudioAnswerFirstAttemptRun): Promise<AutomationStudioAnswerFirstRoundsEnding> {
  const { input } = run;
  const purse = input.creation.purse;
  if (purse.ceilingUsd <= 0) return "budget_out";
  let note: JsonObject | undefined;
  let idleRounds = 0;
  for (let ordinal = 1; ; ordinal += 1) {
    const spentBefore = purse.spentCalls();
    const end = await automationStudioAnswerFirstRound(run, { ordinal, note });
    const next = automationStudioAnswerFirstNext({ end, aborted: stopped(run), purseRefused: run.completion.state.purseRefused || purse.refusal !== undefined, achieved: run.completion.state.achieved, backoffs: run.backoffs });
    if (next.kind === "achieved") return "achieved";
    if (next.kind === "budget_out") return "budget_out";
    if (next.kind === "stopped") return "stopped_by_person";
    if (run.personEnded === "unreachable") return "waiting_for_check";
    await automationStudioAnswerFirstKeep(run);
    if (next.kind === "backoff") {
      automationStudioAnswerFirstSay("Waiting for the model service", next.say);
      run.backoffs += 1;
      await wait(run, next.waitMs);
      continue;
    }
    if (run.askPerson && await askedToStop(run)) return "stopped_by_person";
    run.tried.freshRound();
    idleRounds = purse.spentCalls() === spentBefore ? idleRounds + 1 : 0;
    if (idleRounds > 0) await wait(run, automationStudioAnswerFirstBackoff(idleRounds - 1).waitMs);
    if (stopped(run)) return "stopped_by_person";
    automationStudioAnswerFirstSay("Carrying on", next.why);
    note = await freshNote(run, next.note);
  }
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

/** What a fresh round is told, in Core's words and counts: nothing a page or a model wrote but the check's screened reason. */
async function freshNote(run: AutomationStudioAnswerFirstAttemptRun, note: JsonObject): Promise<JsonObject> {
  const rows = run.sink.summary();
  const refused = run.completion.state.refused;
  return {
    ...note,
    acts: run.record.forModel(),
    tried: run.tried.forModel(),
    rowsKept: { totalRows: rows.totalRows, columns: rows.columns.map((column) => column.id) },
    ...(refused ? { lastCheck: { verdict: refused.verdict, reason: refused.reason } } : {})
  };
}
