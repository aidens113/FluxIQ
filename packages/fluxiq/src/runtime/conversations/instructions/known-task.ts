// The exact words of a task that already has a saved Flow, read with no model call (task speed S6).
//
// A task is its words and its site (`framework/automation-service/service/answer-first/task-key/`).
// When the person types the words of a task that already lives under a saved Flow, on the same site,
// there is nothing to interpret: the chat model read the same words before and started the task, and
// the command it started finds that Flow and runs it (`../commands/create-here.ts`). Asking the model
// again cost a call and about three seconds on every repeat, and could only come to the same answer
// or a worse one. So these words go straight to that command, before the model is asked.
//
// **Only exactly that.** Every condition below must hold, or the message is read by the model as
// before. Each is named, because each is a case where the same words may mean something else:
//
//   no lookup given              the caller cannot reach the task memory
//   no words                     nothing to match
//   the command is not offered   the client's vocabulary has no "do this task" here
//   an ask is waiting            the words may be the person's answer to it, which the model reads
//   asks unreadable              the same, when the thread's asks could not be read
//   a recording is attached      new evidence for a build, which the model reads with the words
//   no saved Flow for the words  a paraphrase, another site, or a task never done
//   the lookup failed            not known, so not matched
//   the command cannot start     a question back or a confirmation: the model's reading decides
//
// What is matched is the task key's own fold of the words (case, spacing and a sentence's last
// punctuation), so the words still go to the command as the person wrote them.

import type { AutomationStudioConversationInterpretation } from "./decision.ts";
import { automationStudioConversationInvocationDecision, type AutomationStudioConversationDecisionContext } from "./invocation.ts";
import type { AutomationStudioConversationKnownTask } from "./request.ts";

/** The command that does a task the person describes on the page they have open (`../commands/create-here.ts`). */
const CREATE_HERE = "flow.createHere";

/** Why a message was not taken as a known task: each condition in the header, by name. */
export type AutomationStudioConversationKnownTaskMiss =
  | "no_lookup"
  | "no_words"
  | "command_not_offered"
  | "ask_waiting"
  | "asks_unreadable"
  | "recording_attached"
  | "not_known"
  | "lookup_failed"
  | "command_cannot_start";

/** The reading of a known task's words, or why there is none (header). */
export async function automationStudioConversationKnownTaskReading(input: {
  message: string;
  context: AutomationStudioConversationDecisionContext;
  knownTask: AutomationStudioConversationKnownTask | undefined;
}): Promise<{ interpretation: AutomationStudioConversationInterpretation } | { miss: AutomationStudioConversationKnownTaskMiss }> {
  const { context, knownTask } = input;
  if (!knownTask) return { miss: "no_lookup" };
  if (!input.message.trim()) return { miss: "no_words" };
  if (!context.capabilities.some((capability) => capability.id === CREATE_HERE)) return { miss: "command_not_offered" };
  if ((context.waitingAsks?.length ?? 0) > 0) return { miss: "ask_waiting" };
  if (context.waitingAsksWithheld === true) return { miss: "asks_unreadable" };
  if (context.onScreen.recordingId) return { miss: "recording_attached" };
  let known: boolean;
  try {
    known = (await knownTask(input.message)) === true;
  } catch {
    return { miss: "lookup_failed" };
  }
  if (!known) return { miss: "not_known" };
  // The same arguments the model gives when it starts the task: the person's words as the instruction.
  const decision = automationStudioConversationInvocationDecision(CREATE_HERE, { instruction: input.message }, context, null);
  if (decision.kind !== "invoke" || decision.invocation.asksFirst) return { miss: "command_cannot_start" };
  return { interpretation: { decision, source: "known_task", modelProblem: null, attempts: 0 } };
}
