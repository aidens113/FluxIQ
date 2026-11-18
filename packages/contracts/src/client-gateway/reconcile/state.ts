/**
 * What became of one command, as the client that was sent it answers
 * `server.reconcile_command` (state-aware recovery plan, C8 and B3). The client
 * answers from what it kept and never by acting:
 *
 * - `landed`: the command finished there; `result` is the result it kept, the
 *   one whose delivery was lost;
 * - `not_seen`: the client has no record of that id, so the act never reached
 *   it and making it again is not a second act. A client that answers this
 *   refuses the id from then on, so a copy still on its way cannot act later;
 * - `running`: the command is still being carried out;
 * - `unknown`: the client cannot say -- for example its record was cleared by a
 *   restart before a result was kept. Core never makes the act again on it.
 */
export const CLIENT_GATEWAY_RECONCILE_STATES = Object.freeze(["landed", "not_seen", "running", "unknown"] as const);
export type ClientGatewayReconcileState = (typeof CLIENT_GATEWAY_RECONCILE_STATES)[number];
