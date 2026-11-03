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
// What counts: every person turn since the thread last closed what was asked
// -- a capability's result, a command's question, a candidate draft, or
// Core's answer to a message that was not a question back -- up to and
// including the turn Core's answer answers, each whole and in order, joined by
// a blank line. The assistant's words between them are left out. A request
// spread over Core's question and its answer ("make me a flow for kettles",
// "which site?", "this one, the first ten") is then all there, and a message
// that holds more than the instruction is kept whole rather than cut to a
// guessed span. The answered turn is the last person turn before Core's
// answer, so a turn written after the answer never counts.
//
// Core's answer closes what came before it unless it was its one question back
// (t728 F3). The headed chat check asked "What can you do?", read Core's list,
// then typed a build; with no model key, Core saved "What can you do?\n\nCreate
// a flow ..." as the instruction and named the Flow "What can you do?". What
// Core decided is recorded on the answer it wrote (`instructions/respond.ts`,
// read here with `decisions`), and that decides, never the wording:
//
// - `clarify`: Core could not tell what was wanted and asked; the next message
//   finishes the same request, so the reading goes on past it.
// - `reply`: Core read the message as asking for nothing to be done (a
//   question about what it can do, thanks, something it could not act on) and
//   answered it. Nothing in it is part of the next request, even when the
//   answer ends by asking what they would like.
// - `invoke`: Core took the words as a command and announced it, asked to
//   confirm it, or said why it could not set it up. Those words were spent on
//   that command; a command's later result would close them anyway, and an
//   announcement whose result never reaches the thread must not leave them to
//   be read into the next build.
//
// A turn with no recorded decision -- every turn written before decisions were
// recorded, and Core's progress and run turns -- closes only as it always did,
// by an attachment or an ask. Over-reading an old thread keeps a request whole
// at the cost of an earlier remark; guessing from its words could instead cut
// the answer to a question Core asked off from the request it finished, losing
// what the person said they wanted.

import { AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT } from "./instructions/index.ts";
import type { AutomationStudioConversationTurn } from "./turn.ts";
import { automationStudioConversationWholeThread, type AutomationStudioConversationThreadPage } from "./whole-thread.ts";

/**
 * The person's words that `answerTurnId` answers, or null when the thread does
 * not hold that turn or no person turn comes before it. `read` is the store's
 * page reader with `decisions` (`conversations.ts`); one without them reads
 * every turn of Core's as written before decisions were recorded, which keeps
 * more of the thread, never less. A thread that cannot be read throws: that
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

/**
 * A turn that closes what was asked before it: a result the panel or a command
 * recorded, a command's question, a draft it saved, or Core's answer to a
 * message that it did not answer with a question back.
 */
function showsSomethingDone(turn: AutomationStudioConversationTurn): boolean {
  if (turn.attachment?.kind === AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT) return true;
  if (turn.author !== "automation") return false;
  if (turn.attachment !== null || turn.ask !== null) return true;
  return turn.decision === "reply" || turn.decision === "invoke";
}
