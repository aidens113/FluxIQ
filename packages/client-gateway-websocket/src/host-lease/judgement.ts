// The host-lease rule a client enforces, per resource key, against the highest
// lease it has seen. Core's scheduler grants one holder at a time a resource
// and its gateway stamps each command with the lease it was issued under; Core
// refuses a command from a holder that lost the lease before it is sent, and
// the client checks again, so a command already on its way when the lease
// moved still cannot act. Serialization is Core's; this catches late copies.
//
//  - a higher epoch is adopted -- the resource was granted again;
//  - the same epoch and holder is the current lease;
//  - a lower epoch is stale: a lease that was released or reissued;
//  - the same epoch with another holder is a mismatch, which a correct Core
//    never sends, since an epoch names one grant to one holder.

import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayHostLeaseJudgement } from "./types.ts";

/** The rule above. `seen` is the highest lease kept for the same resource key, or none. */
export function clientGatewayHostLeaseJudgement(lease: ClientGatewayHostLease, seen: ClientGatewayHostLease | undefined): ClientGatewayHostLeaseJudgement {
  if (seen === undefined || lease.epoch > seen.epoch) return "adopt";
  if (lease.epoch < seen.epoch) return "stale";
  return lease.holder.role === seen.holder.role && lease.holder.briefId === seen.holder.briefId ? "current" : "holder_mismatch";
}
