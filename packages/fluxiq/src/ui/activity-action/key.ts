import type { ActivityActionEvent } from "./types.ts";

/**
 * The identity every event about one card shares, so a client updates that
 * card in place rather than drawing another. Null for an event that is a card
 * of its own, or no card.
 *
 * - An ask: `ask:<ref>`, the ask id. The row that opens a wait on the person
 *   and the row that settles it carry the same one, whatever phase each is in.
 * - A tool call or a check: `<kind>:<ref>`, or `<kind>:<title>` without a ref.
 *   Its start and its end share it; a client closes the identity when the
 *   call ends, so the next call of the same tool opens a card of its own.
 *
 * A robot check a tool reported (its result code names an intervention) has no
 * ask id of its own; a client joins it to the waiting check card of the same
 * unit of work (see the Core panel's `conversation/activity/steps/messages.ts`).
 */
export function activityActionKey(event: ActivityActionEvent): string | null {
  const detail = event.detail;
  if (!detail) return null;
  const ref = detail.ref?.trim();
  if (detail.kind === "ask") return ref ? `ask:${ref}` : null;
  if (detail.kind === "tool" || detail.kind === "check") return `${detail.kind}:${ref || detail.title}`;
  return null;
}
