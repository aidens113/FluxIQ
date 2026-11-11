// Which panel threads work is using now, so a thread is never removed under it.
//
// A message's work and the work an answered card starts write into their thread
// until they end (`./panel-assistant.ts`). Removing the thread under them would
// end that work in "Unknown conversation" after it had already asked the model,
// so the person would pay for answers that land nowhere. So each request holds
// its thread from the moment it names it until its work ends, and a removal is
// refused with `conversation_run_active` while anything holds it. While a removal
// runs, a new hold is refused as a thread that does not exist. Both checks are
// synchronous, so a hold and a removal can never both pass.
//
// This is the panel thread's whole link to work: its asks never park a run
// (a card is `parks: false`), and a run or build a tool starts writes into its
// own project's thread, not this one. The holds are this process's: the
// assistant's work runs only in the process that registered its endpoints.

import { AutomationStudioConversationRefusal } from "../refusal.ts";

export class PanelAssistantThreadUse {
  private readonly held = new Map<string, number>();
  private readonly removing = new Map<string, number>();

  /** Holds `key` until the returned release is called (once; later calls do nothing). Refused as a missing thread while it is being removed. */
  hold(key: string): () => void {
    if (this.removing.has(key)) throw new AutomationStudioConversationRefusal("conversation_not_found");
    increment(this.held, key);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      decrement(this.held, key);
    };
  }

  /** Runs `remove` while no work holds `key` and none can start; refused with `conversation_run_active` while work holds it. */
  async remove<TResult>(key: string, remove: () => Promise<TResult>): Promise<TResult> {
    if (this.held.has(key)) throw new AutomationStudioConversationRefusal("conversation_run_active");
    increment(this.removing, key);
    try {
      return await remove();
    } finally {
      decrement(this.removing, key);
    }
  }
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function decrement(counts: Map<string, number>, key: string): void {
  const left = (counts.get(key) ?? 1) - 1;
  if (left > 0) counts.set(key, left);
  else counts.delete(key);
}
