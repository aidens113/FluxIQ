// What Core delivered for one traced inbound message (traces and offline
// trials, P3), digested at the moment it was delivered, so a listener that
// changes what it was handed cannot change the record:
//
// - the result handed to the waiting caller: after the client's `interrupted`
//   was read into Core's status, `metadata.trace` stripped and, for a durable
//   command, its result allowlist applied, and only once Core took it as the
//   command's outcome;
// - the event emitted to listeners: its type and its message as published.
//   The session view it carries is left out: its ids and times were minted
//   when the session was set up, outside any trace, and the inbound event
//   already says which session it came from.
//
// Built only when a trace took the message, so an untraced gateway digests
// nothing.

import { clientGatewayTraceDeliveredDigest } from "./delivered-digest.ts";
import type { ClientGatewayTraceDelivery } from "./types.ts";

export class ClientGatewayTraceDeliveryCollector {
  private result: string | null = null;
  private event: string | null = null;

  /** The result handed to the caller waiting on the command. */
  heardResult(value: unknown): void {
    this.result = clientGatewayTraceDeliveredDigest(value);
  }

  /** The event emitted to the gateway's listeners. */
  heardEvent(type: string, message: unknown): void {
    this.event = clientGatewayTraceDeliveredDigest({ type, message });
  }

  read(): ClientGatewayTraceDelivery {
    return { result: this.result, event: this.event };
  }
}
