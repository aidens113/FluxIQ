// Built from pairs for the same reason as `./icons.ts`.
const PAIRS: readonly (readonly [string, string])[] = [
  ["button", "a button"],
  ["link", "a link"],
  ["clickable", "a control"],
  ["field", "a field"],
  ["textbox", "a field"],
  ["checkbox", "a box"],
  ["switch", "a switch"],
  ["radio", "an option"],
  ["option", "an option"],
  ["tab", "a tab"],
  ["select", "a list of choices"],
  ["combobox", "a list of choices"],
  ["menuitem", "a menu item"],
  ["image", "a picture"],
  ["img", "a picture"]
];
const NOUNS: ReadonlyMap<string, string> = new Map(PAIRS);

/**
 * Every noun `activityActionControlNoun` says, for a card to read a sentence
 * that names a control by one ("Clicking a button") back (`./action-of.ts`).
 */
export const ACTIVITY_ACTION_CONTROL_NOUNS: readonly string[] = Object.freeze([...new Set(NOUNS.values())]);

/**
 * What a control is, in a plain noun, from the word a page view printed for
 * it ("button" is "a button"), for a control the view printed no words for:
 * a wordless icon's class read as its name, "Reading the details of
 * “css-0732x7m”" (t753). Nothing for a word not known here, so the wording
 * says its plain sentence ("Clicking on the page") rather than a guess.
 */
export function activityActionControlNoun(kind: string | undefined): string | undefined {
  return kind === undefined ? undefined : NOUNS.get(kind.trim().toLowerCase());
}
