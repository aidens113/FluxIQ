import type { ActivityActionVerb } from "./types.ts";

// Built from pairs for the same reason as `./icons.ts`.
const PAIRS: readonly (readonly [ActivityActionVerb, string])[] = [
  // An option chosen and a box ticked are clicks by kind, and their cards read
  // "Click" (lane A U1): the card says the act a person would name.
  ["select", "Choose"],
  ["check", "Tick"],
  ["dialog", "Answer dialog"],
  // A key pressed is typing by kind; "Type · Enter" said nothing was pressed.
  ["key", "Press key"],
  ["search", "Search"],
  ["clear", "Clear field"],
  ["back", "Go back"],
  // A list's next page: its card read "Action · Dom next page" (lane C, `run-mv0fuotv-805294d7`).
  ["next", "Next page"],
  ["tab", "Switch tab"],
  ["scroll", "Scroll"],
  ["upload", "Add file"],
  ["download", "Download"]
];

/**
 * The short name a card carries for a verb whose act is narrower than its
 * kind's name (`./names.ts`): "Choose" for an option chosen, which is a click
 * by kind. A verb not here is named by its kind.
 */
export const ACTIVITY_ACTION_VERB_NAMES: Readonly<Partial<Record<ActivityActionVerb, string>>> = Object.freeze(Object.fromEntries(PAIRS) as Partial<Record<ActivityActionVerb, string>>);
