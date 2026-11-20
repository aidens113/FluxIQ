// The chat's first message, as the person wrote it: Core titles a thread with it, so the thread header uses it
// to avoid saying the same words twice. Known only when the whole chat is loaded: with earlier turns still
// unread, the first turn on screen is not the chat's first message.

import type { ConversationState } from "../conversation/index.ts";

/** The person's first sent message in `state`, or undefined when it is not on screen or not known. */
export function firstPersonMessage(state: Pick<ConversationState, "turns" | "earlierTurns">): string | undefined {
  if (state.earlierTurns === true) return undefined;
  const first = state.turns.find((turn) => turn.author === "person" && turn.sendError === undefined);
  return first?.text.trim() ? first.text : undefined;
}
