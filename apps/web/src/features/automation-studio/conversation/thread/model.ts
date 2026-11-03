// Which turn of a thread is still waiting on the person. The chat widget owns
// the transcript itself (merging, the bounded tail, the thread list); the
// globally mounted prompt (`pending-asks.ts`) asks only this.

import type { ConversationTurn } from "./contracts";

/**
 * The turn the person still owes an answer to: the newest one carrying an ask
 * whose status is still `pending`. Only one is ever offered, so a thread that
 * parked twice does not present two questions at once.
 */
export function pendingConversationTurn(turns: readonly ConversationTurn[]): ConversationTurn | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!;
    if (turn.ask && turn.ask.status === "pending") return turn;
  }
  return null;
}
