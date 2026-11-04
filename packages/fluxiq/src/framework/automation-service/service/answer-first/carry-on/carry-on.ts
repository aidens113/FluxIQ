// "Add budget and carry on" (design, "Carry on"): a person's press, answered at once, on an attempt
// that ran out of budget or was cut off by a restart. It decides here whether it may start, and
// `run` (the generation path, as the client calls it) then goes on inside a scope the attempt's
// ceiling and opening read, so the same attempt goes on: its id, its act record, what it tried, its
// steps and its rows. The Flow is never run again from its start.
//
// **The attempt is claimed before anything is read**, so two presses at once cannot both start it.
// **Refusing changes nothing.** **The row says `working` from the press on**, so a client reading it
// right after sees what is true, with no `endedAtMs`. A run that never gets as far as an attempt
// (a setup step, a refusal) puts the row back as it was: the person's money was not spent and
// their press did not take, so nothing may look as if it did.

import { automationStudioAnswerFirstAttemptStoreOf, type AutomationStudioAnswerFirstAttemptRecord, type AutomationStudioAnswerFirstAttemptStore } from "../attempt-store/index.ts";
import { automationStudioAnswerFirstInterruptedView, automationStudioAnswerFirstLiveAttemptsOf } from "../interrupted/index.ts";
import { automationStudioAnswerFirstRunActStoreOf } from "../run-acts/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstTaskMemory } from "../task-memory/index.ts";
import { automationStudioAnswerFirstAttemptActs } from "./attempt-acts.ts";
import type { AutomationStudioAnswerFirstCarryOnAnswer, AutomationStudioAnswerFirstCarryOnRefusedCode } from "./answer.ts";
import { automationStudioAnswerFirstCarryOnScope, type AutomationStudioAnswerFirstCarryOnHold } from "./hold.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_CARRY_ON_REFUSED_WORDS } from "./refused-words.ts";

type Ports = Parameters<typeof automationStudioAnswerFirstAttemptStoreOf>[1] & Parameters<typeof automationStudioAnswerFirstTaskMemoryOf>[1];
type Request = { projectId: string; attemptId: string; addUsd: number };

export async function automationStudioAnswerFirstCarryOn<T>(owner: object, ports: Ports, request: Request, run: (at: { flowId: string; taskId: string }) => Promise<T>): Promise<AutomationStudioAnswerFirstCarryOnAnswer<T>> {
  const live = automationStudioAnswerFirstLiveAttemptsOf(owner);
  if (!live.claim(request.attemptId)) return refused("live");
  const store = automationStudioAnswerFirstAttemptStoreOf(owner, ports);
  let started = false;
  try {
    const decided = await decide(owner, ports, store, request);
    if (typeof decided === "string") return refused(decided);
    await written(store, decided.projectId, decided.flowId, goingOn(decided));
    const finished = automationStudioAnswerFirstCarryOnScope.run(decided, async () => await run({ flowId: decided.flowId, taskId: decided.taskId })).finally(async () => {
      if (decided.opened) return;
      await written(store, decided.projectId, decided.flowId, decided.before);
      live.release(decided.attemptId);
    });
    // A press may be answered and then never looked at again, and that is no reason for a failed run to take the process down.
    finished.catch(() => undefined);
    started = true;
    return { ok: true, attemptId: decided.attemptId, budgetUsd: decided.budgetUsd, finished };
  } finally {
    if (!started) live.release(request.attemptId);
  }
}

function refused(code: AutomationStudioAnswerFirstCarryOnRefusedCode): { ok: false; refused: AutomationStudioAnswerFirstCarryOnRefusedCode; say: string } {
  return { ok: false, refused: code, say: AUTOMATION_STUDIO_ANSWER_FIRST_CARRY_ON_REFUSED_WORDS[code] };
}

/** May it start: what it goes on with, or why not. Never throws: what cannot be read refuses the press. */
async function decide(owner: object, ports: Ports, store: AutomationStudioAnswerFirstAttemptStore, request: Request): Promise<AutomationStudioAnswerFirstCarryOnHold | AutomationStudioAnswerFirstCarryOnRefusedCode> {
  const { projectId, attemptId, addUsd } = request;
  if (!Number.isFinite(addUsd) || addUsd < 0) return "no_budget_added";
  const memory = automationStudioAnswerFirstTaskMemoryOf(owner, ports);
  let rows: AutomationStudioAnswerFirstAttemptRecord[];
  let kept: AutomationStudioAnswerFirstTaskMemory | undefined;
  let found: { taskId: string; flowId: string } | undefined;
  try {
    found = await memory.attemptLocation(projectId, attemptId);
    if (!found) return "unknown_attempt";
    kept = await memory.get(projectId, found.taskId);
    rows = await store.list(projectId, found.flowId);
  } catch {
    return "unreadable";
  }
  const row = rows.find((each) => each.attempt.attemptId === attemptId);
  if (!row) return "unknown_attempt";
  // Claimed above, and not live before that: a row still saying it is at work is one a restart cut off.
  const before = automationStudioAnswerFirstInterruptedView(row) ?? row;
  const not = whyNot(before, addUsd);
  if (not) return not;
  const last = kept?.attempts.at(-1);
  if (last && last.attemptId !== attemptId) return "later_attempt";
  const acts = await actsOrRefused(owner, ports, kept, { projectId, flowId: found.flowId, attemptId, before, latestOnFlow: rows.at(-1) === row });
  if (acts === "acts_unreadable") return acts;
  const { budget, spend } = before.attempt;
  return { projectId, flowId: found.flowId, taskId: found.taskId, attemptId, before, kept, acts, askedUsd: Math.max(0, budget.usd - spend.usd) + addUsd, budgetUsd: budget.usd + addUsd, opened: false };
}

function whyNot({ attempt }: AutomationStudioAnswerFirstAttemptRecord, addUsd: number): AutomationStudioAnswerFirstCarryOnRefusedCode | undefined {
  if (attempt.status === "achieved") return "achieved";
  if (attempt.status === "stopped_by_person") return "stopped";
  if (attempt.status === "budget_out") return addUsd > 0 ? undefined : "no_budget_added";
  if (attempt.status === "waiting_for_person" && attempt.waitingFor === "interrupted") return undefined;
  return "waiting_for_person";
}

async function actsOrRefused(owner: object, ports: Ports, kept: AutomationStudioAnswerFirstTaskMemory | undefined, where: Parameters<typeof automationStudioAnswerFirstAttemptActs>[2]): Promise<AutomationStudioAnswerFirstCarryOnHold["acts"] | "acts_unreadable"> {
  try {
    const acts = await automationStudioAnswerFirstAttemptActs(kept, automationStudioAnswerFirstRunActStoreOf(owner, ports), where);
    return acts === "unreadable" ? "acts_unreadable" : acts;
  } catch {
    return "acts_unreadable";
  }
}

/** The row while it goes on (header). */
function goingOn(hold: AutomationStudioAnswerFirstCarryOnHold): AutomationStudioAnswerFirstAttemptRecord {
  const { attempt } = hold.before;
  const { status: _status, endedAtMs: _endedAtMs, ...held } = attempt as typeof attempt & { waitingFor?: unknown };
  const { waitingFor: _waitingFor, ...fields } = held;
  return { ...hold.before, attempt: { ...fields, status: "working", budget: { usd: hold.budgetUsd } } };
}

/** A row not written costs this write, and the attempt's own next write tries again: the row is not what the press is. */
async function written(store: AutomationStudioAnswerFirstAttemptStore, projectId: string, flowId: string, record: AutomationStudioAnswerFirstAttemptRecord): Promise<{ ok: true } | { ok: false; errorName: string }> {
  try {
    await store.save(projectId, flowId, record);
    return { ok: true };
  } catch (error) {
    return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
  }
}
