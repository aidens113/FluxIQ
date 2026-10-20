// The payload schemas of the events the gateway tap records. An envelope is a
// protocol message as sent or received; the others are the tap's own records.

import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "@fluxiq/contracts/client-gateway";

export const CLIENT_GATEWAY_TRACE_TAP_SCHEMAS = Object.freeze({
  envelope: Object.freeze({ name: "client-gateway.envelope", version: CLIENT_GATEWAY_PROTOCOL_VERSION }),
  /** Version 2 adds `delivered`: the digests of what Core delivered for the message. */
  disposition: Object.freeze({ name: "client-gateway.trace.disposition", version: "2" }),
  lifecycle: Object.freeze({ name: "client-gateway.trace.lifecycle", version: "1" }),
  synthesized: Object.freeze({ name: "client-gateway.trace.synthesized", version: "1" })
});
