// The thread the person and the automation have been talking in, as a request
// carries it.
//
// FluxIQ's standing rule is that the conversation is the general channel to the
// person: a permission it needs, a decision between two readings of an
// instruction, an approval of a repair. A model that cannot read that thread is
// a model repairing a Flow while the sentence that explains the failure sits
// one screen away -- the person may already have said "only the Plus ones", or
// answered the question the run asked an hour ago.
//
// **What is carried.** Turn ordinal, who said it, and what they said. Not the
// ask's own structure, not attachments, not actor ids: an ask that is still
// waiting is a fact the run already carries, an attachment names something the
// reader renders and the model cannot, and who typed it is identity the repair
// has no use for.
//
// **Every turn, whole, in reading order** (user, 2026-09-30: "Remove ANY AND ALL
// LIMITS ON THE NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION").
// Until then the packer kept the last 20 turns that fit 4,000 bytes, each cut
// at 1,500 characters. Only an empty turn is left out: it says nothing.
// `withheldTurns` and `textCut` stay on the slot, always 0 and false, so a
// reader of a stored request reads it as it always did.

import type { AutomationStudioConversationTurn } from "../../conversations/index.ts";

/** One turn, as a request carries it. */
export type AutomationStudioLlmConversationTurn = {
  ordinal: number;
  author: "automation" | "person";
  text: string;
};

/** The thread, every turn of it. */
export type AutomationStudioLlmConversationContext = {
  turns: AutomationStudioLlmConversationTurn[];
  /** Always 0: no turn is left out. Kept for a stored request that still reads it. */
  withheldTurns: number;
  /** Always false: no turn is cut. Kept for a stored request that still reads it. */
  textCut: boolean;
};

/**
 * The thread as a request carries it, or `undefined` when there is none to
 * carry -- no thread, or one whose every turn is empty.
 *
 * `undefined` rather than an empty list, so the slot is absent from the packet
 * instead of present and saying nothing: a request that carries `turns: []`
 * spends bytes to state an absence the packet already states by omission.
 */
export function packAutomationStudioLlmConversation(
  turns: readonly AutomationStudioConversationTurn[]
): AutomationStudioLlmConversationContext | undefined {
  const kept: AutomationStudioLlmConversationTurn[] = [];
  for (const turn of turns) {
    const text = turn.text.trim();
    if (text) kept.push({ ordinal: turn.ordinal, author: turn.author, text });
  }
  if (!kept.length) return undefined;
  return { turns: kept, withheldTurns: 0, textCut: false };
}
