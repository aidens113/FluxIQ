import { PANEL_ASSISTANT_REQUEST_WORDS as WORDS } from "./request-words.ts";
import type { PanelAssistantSpokenWord } from "./spoken-words.ts";

// Words a message may open with before what it says: "please, ...", "ok so ...".
const OPENERS: ReadonlySet<string> = new Set(["please", "ok", "okay", "so", "hey", "hi"]);

/**
 * Whether the words are put as a request at all: no negation and no condition
 * or choice anywhere, and no question unless it is a request ("can you ...",
 * "could you ...", "would you ...", "will you ..."), whether or not it ends in
 * a question mark ("should I delete it", "how do I delete it" are questions).
 */
export function panelAssistantSaidAsRequest(words: readonly PanelAssistantSpokenWord[]): boolean {
  if (words.some(({ word }) => WORDS.negation.has(word) || WORDS.doubt.has(word))) return false;
  const opening = words.filter(({ boundary }) => !boundary).map(({ word }) => word);
  const start = opening.findIndex((word) => !OPENERS.has(word));
  if (start < 0) return false;
  const first = opening[start]!;
  const asksYou = ["can", "could", "would", "will"].includes(first) && opening[start + 1] === "you";
  if (asksYou) return true;
  if (WORDS.question.has(first)) return false;
  return !words.some(({ word, boundary }) => boundary && word === "?");
}
