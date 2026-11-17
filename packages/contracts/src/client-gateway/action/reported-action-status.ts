/**
 * The statuses a client may report for an action, in order of the wire:
 * Core's own five, plus `interrupted` -- the client lost the command in flight
 * (its background worker stopped, or its channel to the page closed) and does
 * not know whether the act happened.
 *
 * Core reads `interrupted` the way it reads the wire status a client sent
 * before it existed (state-aware recovery plan, C8 and B3): a committing act is
 * `unknown`, its outcome uncertain (`effect: "ambiguous"`), and every other act
 * is `failed` having done nothing (`effect: "unacted"`). Which acts commit is
 * the domain's fact, so Core takes it from the result's `failure.effect`: only
 * a record stating `unacted` makes it a failure, and a result that states
 * nothing is held uncertain. A client built earlier sends `unknown` or `failed`
 * with `payload.status: "interrupted"`, which Core still accepts and records as
 * interrupted.
 */
export const CLIENT_GATEWAY_REPORTED_ACTION_STATUSES = Object.freeze(["succeeded", "failed", "timed_out", "cancelled", "unknown", "interrupted"] as const);
export type ClientGatewayReportedActionStatus = (typeof CLIENT_GATEWAY_REPORTED_ACTION_STATUSES)[number];
