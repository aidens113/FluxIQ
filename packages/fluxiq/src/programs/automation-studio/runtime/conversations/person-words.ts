// What the person said that a turn of Core's answers: their own words, as
// written.
//
// The chat model decides that a build happens, never what it says (t349). Lane
// A round 2 (`run-muylu4pp-f9cb2121`) saved the chat model's paraphrase of the
// person's message as the Flow's generation instruction, and requirements, the
// candidate's source binding and both judges then worked from the paraphrase.
// So a command that saves or passes an instruction reads it from the thread,
// through the collaborator (`conversations.ts` `personWords`,
// `commands/argument.ts`).
//
// What counts: every person turn since the thread last showed something done
// -- a capability's result, a command's question, a candidate draft -- up to
// and including the turn Core's answer answers, each whole and in order, joined
// by a blank line. The assistant's words between them are left out. A request
// spread over a question and its answer ("make me a flow for kettles", "which
// site?", "this one, the first ten") is then all there, and a message that
// holds more than the instruction is kept whole rather than cut to a guessed
// span. The answered turn is the last person turn before Core's answer, so a
// turn written after the answer never counts.

import { AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT } from "./instructions/index.ts";
import type { AutomationStudioConversationTurn } from "./turn.ts";
import { automationStudioConversationWholeThread, type AutomationStudioConversationThreadPage } from "./whole-thread.ts";

/**
 * The person's words that `answerTurnId` answers, or null when the thread does
 * not hold that turn or no person turn comes before it. `read` is the store's
 * or the collaborator's page reader. A thread that cannot be read throws: that
 * is not the same as there being no person turn, and must not quietly fall back.
 */
export async function automationStudioConversationPersonWords(
  read: (input: { conversationId: string; limit: number; sinceTurnId?: string }) => Promise<AutomationStudioConversationThreadPage>,
  conversationId: string,
  answerTurnId: string
): Promise<string | null> {
  const turns = await automationStudioConversationWholeThread(read, conversationId);
  const answer = turns.findIndex((turn) => turn.turnId === answerTurnId);
  if (answer < 0) return null;
  const words: string[] = [];
  for (let index = answer - 1; index >= 0; index -= 1) {
    const turn = turns[index]!;
    // A turn written while the person typed (a running build's question) can sit before Core's answer: the person's turn is still the one before it.
    if (words.length && showsSomethingDone(turn)) break;
    if (turn.author !== "person" || turn.attachment?.kind === AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT || !turn.text.trim()) continue;
    words.unshift(turn.text);
  }
  const said = words.join("\n\n").trim();
  return said || null;
}

/** A turn that closes what was asked before it: a result the panel or a command recorded, a command's question, a draft it saved. */
function showsSomethingDone(turn: AutomationStudioConversationTurn): boolean {
  if (turn.attachment?.kind === AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT) return true;
  return turn.author === "automation" && (turn.attachment !== null || turn.ask !== null);
}
