// "Run again" on a task's answer: a person's press, and the one thing that says do it again (t869; the
// rule is in `runtime/answer-first/act-record/seed.ts`). It starts a new attempt at the task, with an
// empty act record, from the Flow the task lives under and the place it was first asked from.
//
// **Answered at once**, as a carry-on is (`../carry-on/carry-on.ts`): the attempt then goes on in the
// background through the generation path a first attempt takes, inside a scope its opening reads. The
// press names only a task, and what the Flow's goal says is what runs, so a goal another task has since
// put there is refused rather than run under this task's memory. A memory written before it kept its
// start place can say nothing of that, and runs. A task a caller drove under its own key (a FluxNode)
// is known by that key, and its new attempt goes on under the options its latest attempt kept.
//
// **Refusing changes nothing.** **Two presses at once start one**: the first claims the task.
//
// **A task a person stopped part way is finished by Carry on, never by this.** Its last attempt keeps
// its own record when carried on, so what it pressed before the Stop stays pressed once. A Run again
// would start empty and press it again, so it is refused, in words that say to carry on, while that
// attempt holds a lasting act of its own (not one it carried from earlier).

import { randomUUID } from "node:crypto";
import type { AutomationStudioAttemptActEntry } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioAnswerFirstKeptCallerOptions } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstLiveAttemptsOf } from "../interrupted/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstTaskMemory, type AutomationStudioAnswerFirstTaskMemoryPorts } from "../task-memory/index.ts";
import type { AutomationStudioAnswerFirstRunAgainAnswer, AutomationStudioAnswerFirstRunAgainRefusedCode } from "./answer.ts";
import { automationStudioAnswerFirstRunAgainScope, type AutomationStudioAnswerFirstRunAgainHold } from "./hold.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_RUN_AGAIN_REFUSED_WORDS } from "./refused-words.ts";

type Request = {
  projectId: string;
  taskId: string;
  /** The words the Flow's goal holds now, or none where it holds no one goal. */
  goalWords(flowId: string): Promise<string | undefined>;
};
type Started = { flowId: string; startLocation: string | undefined; caller?: AutomationStudioAnswerFirstKeptCallerOptions | undefined };

export async function automationStudioAnswerFirstRunAgain<T>(owner: object, ports: AutomationStudioAnswerFirstTaskMemoryPorts, request: Request, run: (at: Started) => Promise<T>): Promise<AutomationStudioAnswerFirstRunAgainAnswer<T>> {
  const live = automationStudioAnswerFirstLiveAttemptsOf(owner);
  const pressing = `run-again.${request.taskId}`;
  if (!live.claim(pressing)) return refused("live");
  let started = false;
  try {
    const decided = await decide(owner, ports, request);
    if (typeof decided === "string") return refused(decided);
    const hold: AutomationStudioAnswerFirstRunAgainHold = { projectId: request.projectId, flowId: decided.flowId, taskId: request.taskId, attemptId: `attempt.${randomUUID()}`, opened: false, ...(decided.caller ? { caller: decided.caller } : {}) };
    const finished = automationStudioAnswerFirstRunAgainScope.run(hold, async () => await run(decided)).finally(() => live.release(pressing));
    // A press may be answered and never looked at again, and that is no reason for a failed run to take the process down.
    finished.catch(() => undefined);
    started = true;
    return { ok: true, attemptId: hold.attemptId, flowId: decided.flowId, finished };
  } finally {
    if (!started) live.release(pressing);
  }
}

function refused(code: AutomationStudioAnswerFirstRunAgainRefusedCode): { ok: false; refused: AutomationStudioAnswerFirstRunAgainRefusedCode; say: string } {
  return { ok: false, refused: code, say: AUTOMATION_STUDIO_ANSWER_FIRST_RUN_AGAIN_REFUSED_WORDS[code] };
}

/** Whether it may start, and from where. Never throws: what cannot be read refuses the press. */
async function decide(owner: object, ports: AutomationStudioAnswerFirstTaskMemoryPorts, request: Request): Promise<Started | AutomationStudioAnswerFirstRunAgainRefusedCode> {
  let kept: AutomationStudioAnswerFirstTaskMemory | undefined;
  let words: string | undefined;
  try {
    kept = await automationStudioAnswerFirstTaskMemoryOf(owner, ports).get(request.projectId, request.taskId);
    if (!kept?.flowId) return "unknown_task";
    words = await request.goalWords(kept.flowId);
  } catch {
    return "unreadable";
  }
  const last = kept.attempts.at(-1);
  if (last && automationStudioAnswerFirstLiveAttemptsOf(owner).has(last.attemptId)) return "live";
  if (last?.stoppedByPerson && kept.acts?.attemptId === last.attemptId && kept.acts.data.acts.some(ownLasting)) return "stopped_part_way";
  // A task a caller named by its own key is that key, whatever its words (`../task-key/task-key.ts`), and it goes on under what its caller set (`../caller/held.ts`).
  const caller = last?.caller;
  if (words !== undefined && kept.startLocation !== undefined && automationStudioAnswerFirstTaskKey({ instructionText: words, startLocation: kept.startLocation, callerKey: caller?.taskKey }) !== request.taskId) return "other_task_on_flow";
  return { flowId: kept.flowId, startLocation: kept.startLocation, ...(caller ? { caller } : {}) };
}

/** An act the stopped attempt itself did, or may have, that stays: what a Run again would press a second time. */
function ownLasting(act: AutomationStudioAttemptActEntry): boolean {
  return act.carried !== true && (act.state === "landed" || act.state === "may_have_landed") && (!act.undeclared || act.changedState === true);
}
