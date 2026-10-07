import type { ActivityActionKind } from "./types.ts";

// Built from pairs for the same reason as `./icons.ts`.
const PAIRS: readonly (readonly [ActivityActionKind, string])[] = [
  ["click", "Click"],
  ["type", "Type"],
  ["navigate", "Open page"],
  ["read", "Read list"],
  // Not "Look at page": a look names what it looks at or for (a control's
  // details, a list, words on the page), and the card's target says which.
  ["look", "Look"],
  // Reads back an earlier result, never the page; the target names which one.
  ["recall", "Recall result"],
  ["wait", "Wait"],
  ["person_check", "Robot check"],
  ["permission", "Permission"],
  // What was asked, in Core's words: a refused edit's card reads "Change the
  // Flow · Not done: ..." (t193 1003, C13), the verb of the decision's heading
  // "Changing the Flow" (D12 of the t342 round 2 UI review).
  ["draft", "Change the Flow"],
  ["test", "Test run"],
  ["result_check", "Check result"],
  ["repair", "Repair"],
  ["join", "Join paths"],
  ["branch", "Choose path"],
  ["repeat", "Repeat"],
  ["other", "Action"]
];

/** The short label each action kind's card carries beside its icon. */
export const ACTIVITY_ACTION_NAMES: Readonly<Record<ActivityActionKind, string>> = Object.freeze(Object.fromEntries(PAIRS) as Record<ActivityActionKind, string>);
