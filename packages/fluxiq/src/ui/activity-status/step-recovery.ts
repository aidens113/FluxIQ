// The recovery one of Core's `step` rows reports, read from the raw activity
// event (state-aware recovery plan, C11; `ClientGatewayActivity.detail.recovery`).
//
// Core puts a closed `recovery` on a step row when a lifecycle handler ran, a
// frame began at an alternative entry, the run took a route, an alternative
// path was tried, or the extension closed a layer the page put in the way
// (`interference`, subject "Closed a notice the page put in the way"), or a
// step whose target came from an earlier step found it again (`reacquire`, t786), so a
// card can be drawn from closed fields rather than by parsing Core's sentence.
// This is the one reader: it keeps the field only on a `step` row and only in
// the contract's shape, so a panel never draws a card from a value an older or
// newer Core sent in another form.
//
// Pure: no browser API.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** The recovery a step row reports, as the wire contract declares it. */
export type ActivityStepRecovery = NonNullable<NonNullable<ClientGatewayActivity["detail"]>["recovery"]>;

// Records over the contract's unions, so a value Core adds or drops fails the
// typecheck here instead of being silently read.
const KINDS: Record<ActivityStepRecovery["kind"], true> = { handler: true, entry: true, route: true, alternative: true, interference: true, reacquire: true };
const OUTCOMES: Record<ActivityStepRecovery["outcome"], true> = { succeeded: true, failed: true, refused: true };
const EVENTS: Record<NonNullable<ActivityStepRecovery["event"]>, true> = { start: true, before: true, retry: true, fail: true, before_next: true };

function known<T extends string>(table: Record<T, true>, value: unknown): value is T {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value);
}

/**
 * The recovery `event`'s step row reports, or `undefined` when the row is not
 * a step, carries none, or carries one outside the contract. `event` is kept
 * only on a `handler` recovery, and `targetId` only when it is a string.
 */
export function stepRecovery(event: ClientGatewayActivity): ActivityStepRecovery | undefined {
  const detail = event.detail;
  if (detail?.kind !== "step" || detail.recovery === undefined) return undefined;
  const raw = detail.recovery as unknown as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null) return undefined;
  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  if (!known(KINDS, raw.kind) || !known(OUTCOMES, raw.outcome) || !subject) return undefined;
  return {
    kind: raw.kind,
    subject,
    outcome: raw.outcome,
    ...(raw.kind === "handler" && known(EVENTS, raw.event) ? { event: raw.event } : {}),
    ...(typeof raw.targetId === "string" && raw.targetId !== "" ? { targetId: raw.targetId } : {})
  };
}
