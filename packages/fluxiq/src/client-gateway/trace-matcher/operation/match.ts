// Strict matching of one command against the trace (traces and offline trials,
// P4b; source plan 7.2): the command must equal the recorded operation at the
// cursor. The cursor gives the occurrence and every operation before it, so the
// same call made twice is answered by its place, never by the first recorded
// answer. Anything else is a gap, classified:
//
// - past the last recorded operation: `missing_transition`;
// - the recorded operation withheld a field, for the same action: `redacted_input`;
// - the same action with another target or parameters: `argument_mismatch`;
// - an operation the trace holds only at another point: `ambiguous_context`;
// - otherwise: `missing_transition`.
//
// A gap never consumes the recorded operation: no later one is tried in its place.

import { clientGatewayTraceOperationDifferences } from "./differences.ts";
import type { ClientGatewayTraceOperation, ClientGatewayTraceOperationMatch, ClientGatewayTraceRecordedOperation } from "../types.ts";

export function matchClientGatewayTraceOperation(command: ClientGatewayTraceOperation, cursor: number, recorded: readonly ClientGatewayTraceRecordedOperation[]): ClientGatewayTraceOperationMatch {
  const next = recorded[cursor];
  if (next === undefined) return { status: "gap", reason: "missing_transition", cause: "past_recorded_end", fields: [], recordedSequence: null };
  if (next.redacted && next.actionType === command.actionType) return { status: "gap", reason: "redacted_input", cause: "mismatch", fields: [], recordedSequence: next.sequence };
  if (next.key === command.key) return { status: "matched", recorded: next };
  const fields = clientGatewayTraceOperationDifferences(command, next);
  if (next.actionType === command.actionType) return { status: "gap", reason: "argument_mismatch", cause: "mismatch", fields, recordedSequence: next.sequence };
  const elsewhere = recorded.some((operation, index) => index !== cursor && operation.key === command.key);
  return { status: "gap", reason: elsewhere ? "ambiguous_context" : "missing_transition", cause: "mismatch", fields, recordedSequence: next.sequence };
}
