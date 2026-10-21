// The answer to a command the trace cannot serve (traces and offline trials,
// P4b): a `client.action_result` that failed having done nothing, never
// retryable, whose failure code is the evidence gap
// (`./gap-reasons.ts`). It is fed through `receiveRaw` like any client answer,
// so Core reads it with its own decoder; it never carries a recorded answer.

import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayTraceMatcherGapReason } from "./types.ts";

export function clientGatewayTraceGapAnswer(commandId: string, reason: ClientGatewayTraceMatcherGapReason): string {
  const failure = { category: "blocked_by_capability_or_policy", code: reason, retryable: false, stage: "dispatch", effect: "unacted" };
  const result = { commandId, status: "failed", error: `The trace holds no answer for this call (${reason}).`, failure };
  return JSON.stringify({ id: `trace-gap.${commandId}`, type: "client.action_result", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: result });
}
