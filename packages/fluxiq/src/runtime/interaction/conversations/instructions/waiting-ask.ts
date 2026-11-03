// A question still waiting in the thread, as the chat's model is told about it.
//
// Since A10 a typed answer that names no ask is refused when more than one is
// waiting, and the chat's model can name one only if it knows the ids. So the
// waiting asks travel in the model's own context (`prompt.ts`), each with its
// id beside the words the person read, and the model puts the id of the one
// the person meant into `ask.answer`'s `askId` (A10b). The id is for the
// model alone: the thread keeps no codes (t276), so nothing written for the
// person carries it (`respond.ts`).

import type { AutomationStudioConversationAskKind } from "../ask.ts";

export type AutomationStudioConversationWaitingAsk = {
  /** What `ask.answer`'s `askId` names. Never shown to the person. */
  askId: string;
  kind: AutomationStudioConversationAskKind;
  /** The words of the turn the ask hangs on, as the person read them; null when that turn has none. */
  question: string | null;
  /** The labels of a choice's options, in order; empty for any other kind. */
  options: readonly string[];
  /** The control the ask is about, as the person would recognise it, or null. */
  about: string | null;
};
