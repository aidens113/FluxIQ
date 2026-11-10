/**
 * What calling a tool does, as the panel assistant decides whether to ask the
 * person first. `read` and `change` run at once; the others run unasked only
 * when the person's own words clearly ask for them.
 *
 * - `read` — looks, persists nothing the person would notice.
 * - `change` — creates or edits the person's own content.
 * - `send` — something other people or systems receive or see.
 * - `money` — spends, charges or transfers money.
 * - `delete` — removes something so that it is gone.
 * - `security` — keys, sign-in, people and their access.
 */
export const ASSISTANT_CONSEQUENCES = Object.freeze(["read", "change", "send", "money", "delete", "security"] as const);

export type AssistantConsequence = (typeof ASSISTANT_CONSEQUENCES)[number];

/** Whether `value` is one of `ASSISTANT_CONSEQUENCES`. */
export function isAssistantConsequence(value: unknown): value is AssistantConsequence {
  return typeof value === "string" && (ASSISTANT_CONSEQUENCES as readonly string[]).includes(value);
}
