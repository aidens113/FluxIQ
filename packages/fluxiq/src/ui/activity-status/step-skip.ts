// The skip one of Core's `step` rows reports, read from the raw activity event
// (t416; `ClientGatewayActivity.detail.skipped`).
//
// Core puts a closed `skipped` on a step row when a run step was skipped rather
// than run: its act was already done in this run for the same row
// (`already_done`), a sometimes-present step's target was not shown
// (`optional_absent`), or the page was elsewhere and state routing passed it
// over (`state_routed`). This is the one reader: it keeps the field only on a
// `step` row and only in the contract's shape, so a panel never draws a card
// from a value an older or newer Core sent in another form.
//
// Pure: no browser API.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** The skip a step row reports, as the wire contract declares it. */
export type ActivityStepSkip = NonNullable<NonNullable<ClientGatewayActivity["detail"]>["skipped"]>;

// A record over the contract's union, so a reason Core adds or drops fails the
// typecheck here instead of being silently read.
const REASONS: Record<ActivityStepSkip["reason"], true> = { already_done: true, optional_absent: true, state_routed: true };

/**
 * The skip `event`'s step row reports, or `undefined` when the row is not a
 * step, carries none, or carries one outside the contract. `subject` is kept
 * only when it is a non-blank string, trimmed.
 */
export function stepSkip(event: ClientGatewayActivity): ActivityStepSkip | undefined {
  const detail = event.detail;
  if (detail?.kind !== "step" || detail.skipped === undefined) return undefined;
  const raw = detail.skipped as unknown as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null) return undefined;
  const reason = raw.reason;
  if (typeof reason !== "string" || !Object.prototype.hasOwnProperty.call(REASONS, reason)) return undefined;
  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  return { reason: reason as ActivityStepSkip["reason"], ...(subject ? { subject } : {}) };
}
