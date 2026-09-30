import type { ActivityActionKind } from "./types.ts";

// Built from pairs for the same reason as `./icons.ts`.
const PAIRS: readonly (readonly [ActivityActionKind, string])[] = [
  ["click", "Click"],
  ["type", "Type"],
  ["navigate", "Open page"],
  ["read", "Read list"],
  ["look", "Look at page"],
  ["wait", "Wait"],
  ["person_check", "Robot check"],
  ["permission", "Permission"],
  ["draft", "Edit Flow"],
  ["test", "Test run"],
  ["repair", "Repair"],
  ["other", "Action"]
];

/** The short label each action kind's card carries beside its icon. */
export const ACTIVITY_ACTION_NAMES: Readonly<Record<ActivityActionKind, string>> = Object.freeze(Object.fromEntries(PAIRS) as Record<ActivityActionKind, string>);
