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
// **Newest first in, oldest first out.** A thread outgrows any budget, and the
// end of it is the part that bears on what just happened, so the packer takes
// from the end and then puts what it kept back in reading order. What it left
// behind is counted rather than dropped silently, for the reason the recovery
// context keeps its `omitted` list: "there was nothing more" and "there was
// more and it did not fit" are different facts about the same request.

import type { AutomationStudioConversationTurn } from "../../conversations/index.ts";

/** The longest a single turn may be in a request before it is cut. */
export const AUTOMATION_STUDIO_LLM_CONVERSATION_TURN_MAX_LENGTH = 1_500;

/** The most turns a request may carry, whatever the byte budget allows. */
export const AUTOMATION_STUDIO_LLM_CONVERSATION_MAX_TURNS = 20;

/** The bytes a request's conversation may take. Sits beside the recovery context's own 4,000. */
export const AUTOMATION_STUDIO_LLM_CONVERSATION_MAX_BYTES = 4_000;

/** One turn, as a request carries it. */
export type AutomationStudioLlmConversationTurn = {
  ordinal: number;
  author: "automation" | "person";
  text: string;
};

/** The thread, bounded, with what was left out of it counted. */
export type AutomationStudioLlmConversationContext = {
  turns: AutomationStudioLlmConversationTurn[];
  /** Turns the bound left behind, all of them older than the ones carried. */
  withheldTurns: number;
  /** True when at least one carried turn's text was cut to its length bound. */
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
  turns: readonly AutomationStudioConversationTurn[],
  maxBytes: number = AUTOMATION_STUDIO_LLM_CONVERSATION_MAX_BYTES
): AutomationStudioLlmConversationContext | undefined {
  let textCut = false;
  const kept: AutomationStudioLlmConversationTurn[] = [];
  let bytes = 0;
  // From the end: the turns nearest the failure are the ones that bear on it.
  for (const turn of [...turns].reverse()) {
    if (kept.length >= AUTOMATION_STUDIO_LLM_CONVERSATION_MAX_TURNS) break;
    const text = turn.text.trim();
    if (!text) continue;
    const cut = text.length > AUTOMATION_STUDIO_LLM_CONVERSATION_TURN_MAX_LENGTH;
    const packed: AutomationStudioLlmConversationTurn = {
      ordinal: turn.ordinal,
      author: turn.author,
      text: cut ? `${text.slice(0, AUTOMATION_STUDIO_LLM_CONVERSATION_TURN_MAX_LENGTH - 1)}…` : text
    };
    const cost = Buffer.byteLength(JSON.stringify(packed), "utf8");
    if (kept.length && bytes + cost > maxBytes) break;
    bytes += cost;
    textCut ||= cut;
    kept.push(packed);
  }
  if (!kept.length) return undefined;
  return { turns: kept.reverse(), withheldTurns: Math.max(0, turns.length - kept.length), textCut };
}
