import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { ClientGatewayActionResult, ClientGatewayReportedActionResult, ClientGatewayReportedActionStatus } from "@fluxiq/contracts/client-gateway";

// How Core reads the action result a client sends, before anything waits on it
// (state-aware recovery plan, C8 and browser contract B3).
//
// A client that lost a command in flight -- its background worker stopped, or
// its channel to the page closed -- does not know whether the act happened. It
// says so with `status: "interrupted"`, or, built before that status existed,
// with `unknown` or `failed` and `payload.status: "interrupted"`. Both are
// interrupted to Core.
//
// `interrupted` is read the way that older wire status is: a committing act is
// `unknown`, its outcome uncertain, and every other act is `failed` having done
// nothing. Which acts commit is the domain's fact, carried on the result's
// failure record as `effect`, so Core learns no word of the medium: only a
// record that parses and states `unacted` makes the act a failure, and anything
// else -- `ambiguous`, no record, a record that does not parse -- is held
// uncertain, because a missing acknowledgement is never "did not happen".

/** The client's word for a command it lost in flight. */
export const CLIENT_GATEWAY_INTERRUPTED_ACTION_STATUS = "interrupted";

/** A client's action result as Core reads it. */
export type ClientGatewayActionResultReading = {
  /** The result every caller is handed: `interrupted` already read into `unknown` or `failed`. */
  result: ClientGatewayActionResult;
  /** The status the client sent. */
  reportedStatus: ClientGatewayReportedActionStatus;
  /** Whether the client said it lost the command in flight, by status or by payload marker. */
  interrupted: boolean;
  /** The act's effect, when the result tells it: stated on a valid failure record, or `ambiguous` for an uncertain answer. */
  effect?: "unacted" | "ambiguous";
};

export function readClientGatewayActionResult(input: ClientGatewayReportedActionResult): ClientGatewayActionResultReading {
  const payloadStatus = isRecord(input.payload) ? input.payload.status : undefined;
  const interrupted = input.status === CLIENT_GATEWAY_INTERRUPTED_ACTION_STATUS || payloadStatus === CLIENT_GATEWAY_INTERRUPTED_ACTION_STATUS;
  const stated = parseAutomationStudioFailureRecord(input.failure)?.effect;
  const status: ClientGatewayActionResult["status"] = input.status === CLIENT_GATEWAY_INTERRUPTED_ACTION_STATUS
    ? (stated === "unacted" ? "failed" : "unknown")
    : input.status;
  const result: ClientGatewayActionResult = status === input.status ? input as ClientGatewayActionResult : { ...input, status };
  const effect = stated ?? (status === "unknown" ? "ambiguous" : undefined);
  return { result, reportedStatus: input.status, interrupted, ...(effect ? { effect } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
