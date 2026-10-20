// Which fields of an action command the trace matcher compares with the
// recorded operation, and why every other field is left out (traces and
// offline trials, P4b; source plan 7.2).
//
// An operation is the external call: its action type, its target and its
// parameters, each canonical (object keys sorted, array order kept, an absent
// field read as `null`). Together with the matcher's cursor over the recorded
// operations, that fixes the occurrence and every operation before it.
//
// Left out, each named:
//
// - transport-only, carrying no evidence: the command id (correlation
//   bookkeeping the gateway mints per send; the matcher translates it in what
//   it feeds), `metadata.trace` (the tap's stamp naming the trace the command
//   is recorded into), the host `lease` (the host's ownership stamp, checked
//   by the gateway before anything is sent), and the message envelope (`id`,
//   `timestamp`, `sessionId`, `protocolVersion`), which is minted per message;
// - not compared, and not claimed transport-only: `timeoutMs`, the gateway's
//   own answer wait, which the production timeout logic runs on the trial's
//   clock, so a changed wait meets the recorded latency at its logical time
//   (T13) instead of being matched; and the rest of `metadata`, the caller's
//   annotations, where a program carries its own node, Flow or run identity,
//   which must not be the matching key (T15). Whatever a client reads from
//   them is outside the evidence the match checks: a declared limitation.
export const CLIENT_GATEWAY_TRACE_MATCHER_FIELDS = Object.freeze({
  compared: Object.freeze(["actionType", "target", "parameters"] as const),
  transportOnly: Object.freeze(["commandId", "metadata.trace", "lease", "envelope.id", "envelope.timestamp", "envelope.sessionId", "envelope.protocolVersion"] as const),
  notCompared: Object.freeze(["timeoutMs", "metadata"] as const)
});
