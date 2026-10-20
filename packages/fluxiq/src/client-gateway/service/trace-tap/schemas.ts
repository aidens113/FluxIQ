// The payload schemas of the events the gateway tap records. An envelope is a
// protocol message as sent or received; the others are the tap's own records.

import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "@fluxiq/contracts/client-gateway";

export const CLIENT_GATEWAY_TRACE_TAP_SCHEMAS = Object.freeze({
  envelope: Object.freeze({ name: "client-gateway.envelope", version: CLIENT_GATEWAY_PROTOCOL_VERSION }),
  disposition: Object.freeze({ name: "client-gateway.trace.disposition", version: "1" }),
  lifecycle: Object.freeze({ name: "client-gateway.trace.lifecycle", version: "1" }),
  synthesized: Object.freeze({ name: "client-gateway.trace.synthesized", version: "1" })
});
