// An item's words cut to what one line of an act can carry, at a word and never mid-word (`./item-words.ts`, `./row-words.ts`).

/** The most characters of an item's words said: enough to tell a listing, short enough to stay one line. */
export const AUTOMATION_STUDIO_ATTEMPT_ACT_MOST_ITEM_CHARACTERS = 70;

/** `words` whole when they fit, otherwise cut at a word with "..." after. */
export function automationStudioAttemptActCutItemWords(words: string): string {
  const most = AUTOMATION_STUDIO_ATTEMPT_ACT_MOST_ITEM_CHARACTERS;
  if (words.length <= most) return words;
  const cut = words.slice(0, most - 3);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).replace(/[\s,;:]+$/u, "")}...`;
}
