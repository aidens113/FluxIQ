import { CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayHostLeaseJudgement, ClientGatewayHostLeaseRefusalCode } from "./types.ts";

/** The refusal code a judgement that refuses maps to; `undefined` for one that lets the command run. */
export function clientGatewayHostLeaseRefusalCode(judgement: ClientGatewayHostLeaseJudgement): ClientGatewayHostLeaseRefusalCode | undefined {
  if (judgement === "stale") return CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES.stale;
  if (judgement === "holder_mismatch") return CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES.holderMismatch;
  return undefined;
}
