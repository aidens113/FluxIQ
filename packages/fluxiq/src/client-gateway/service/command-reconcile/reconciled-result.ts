import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { ClientGatewayActionResult, ClientGatewayReconcileAnswer } from "@fluxiq/contracts/client-gateway";
import { readClientGatewayActionResult } from "../action-result-reading.ts";

// The payload marker a `not_seen` result carries, so a domain can restate it in its own record.
const NOT_SEEN_PAYLOAD_STATUS = "not_seen";

const NOT_SEEN_FAILURE: AutomationStudioFailureRecord = Object.freeze({
  category: "timeout",
  code: "client_gateway.command_not_seen",
  retryable: true,
  stage: "dispatch",
  effect: "unacted"
});

/**
 * The result a command whose answer never came is settled with, once its
 * client was asked what became of it (C8, B3):
 *
 * - `landed`: the result the client kept, read as any result is (an
 *   `interrupted` one included), so the caller gets the outcome it would have
 *   had and the act is never made a second time;
 * - `not_seen`: a failure that did nothing (`effect: "unacted"`, retryable), so
 *   the ordinary retry follows; the payload says `not_seen` for a domain that
 *   restates failures in its own codes;
 * - `running` (still, after the one bounded wait) and `unknown`: `timed_out`,
 *   exactly as before the client could be asked, so the caller's effect check
 *   and its uncertain outcome follow and nothing is pressed again.
 *
 * With no answer at all -- no session of that client said it answers, so
 * nobody was asked -- the result is today's `timed_out`, unmarked.
 */
export function clientGatewayReconciledResult(commandId: string, answer: ClientGatewayReconcileAnswer | undefined, waitMs: number): ClientGatewayActionResult {
  const timedOut: ClientGatewayActionResult = { commandId, status: "timed_out", message: `Client action timed out after ${waitMs}ms.` };
  if (!answer) return timedOut;
  if (answer.state === "landed" && answer.result) {
    const kept = readClientGatewayActionResult({ ...answer.result, commandId }).result;
    return { ...kept, metadata: { ...(kept.metadata ?? {}), reconciled: "landed" } };
  }
  if (answer.state === "not_seen") {
    const message = "The client never received this command, so it did not act; it may be sent again.";
    return {
      commandId,
      status: "failed",
      message,
      error: message,
      failure: { ...NOT_SEEN_FAILURE },
      payload: { status: NOT_SEEN_PAYLOAD_STATUS },
      metadata: { reconciled: "not_seen" }
    };
  }
  return { ...timedOut, metadata: { reconciled: answer.state } };
}
