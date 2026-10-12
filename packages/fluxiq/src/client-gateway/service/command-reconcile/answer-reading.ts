import { CLIENT_GATEWAY_REPORTED_ACTION_STATUSES, CLIENT_GATEWAY_RECONCILE_STATES, type ClientGatewayReconcileAnswer, type ClientGatewayReportedActionResult } from "@fluxiq/contracts/client-gateway";

const STATES: ReadonlySet<string> = new Set(CLIENT_GATEWAY_RECONCILE_STATES);
const RESULT_STATUSES: ReadonlySet<string> = new Set(CLIENT_GATEWAY_REPORTED_ACTION_STATUSES);

/**
 * A client's reconcile answer for `commandId`, read field by field because it
 * crossed the socket. An answer for another id, or in no word of the closed
 * set, is no answer. A `landed` answer without a kept result for this very
 * command is read as `unknown`: Core never takes a success it cannot see.
 */
export function readClientGatewayReconcileAnswer(commandId: string, input: unknown): ClientGatewayReconcileAnswer | undefined {
  if (!isRecord(input) || input.commandId !== commandId || typeof input.state !== "string" || !STATES.has(input.state)) return undefined;
  const state = input.state as ClientGatewayReconcileAnswer["state"];
  if (state !== "landed") return { commandId, state };
  const result = input.result;
  if (!isRecord(result) || result.commandId !== commandId || typeof result.status !== "string" || !RESULT_STATUSES.has(result.status)) return { commandId, state: "unknown" };
  return { commandId, state, result: result as ClientGatewayReportedActionResult };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
