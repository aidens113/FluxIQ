import type { ActivityActionKind } from "./types.ts";

// Built from pairs rather than an object literal so the kind names stay string
// values: several of them are words Core's own identifiers never use.
const PAIRS: readonly (readonly [ActivityActionKind, string])[] = [
  ["click", "mouse-pointer-click"],
  ["type", "keyboard"],
  ["navigate", "globe"],
  ["read", "table"],
  ["look", "scan-search"],
  // A look at what Core holds: the look's icon, so no client has to draw a new one.
  ["recall", "scan-search"],
  ["wait", "hourglass"],
  ["person_check", "shield-check"],
  ["permission", "hand"],
  ["draft", "pencil"],
  ["test", "flask-conical"],
  // A look at what the run left: the look's icon, so no client has to draw a new one.
  ["result_check", "scan-search"],
  ["repair", "wrench"],
  ["join", "git-merge"],
  ["branch", "git-branch"],
  ["repeat", "repeat"],
  ["other", "circle-dot"]
];

/**
 * The icon each action kind's card shows: a lucide icon name (Core's icon set,
 * `lucide-react`), in kebab case. A client maps the name to its own component.
 */
export const ACTIVITY_ACTION_ICONS: Readonly<Record<ActivityActionKind, string>> = Object.freeze(Object.fromEntries(PAIRS) as Record<ActivityActionKind, string>);
