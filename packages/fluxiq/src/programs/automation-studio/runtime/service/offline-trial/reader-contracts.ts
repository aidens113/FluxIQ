// The contract versions an offline trial reads a recorded trace under: the
// ones the host's trace episodes record in every manifest
// (`../../gateway-trace/wiring/host.ts`). A trace recorded under any other
// version of one of them is refused (`incompatible_contract`) rather than
// matched against.

import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION,
  CLIENT_GATEWAY_TRACE_SCHEMA_VERSION
} from "../../../../../client-gateway/index.ts";

export const AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS: Readonly<Record<string, string>> = Object.freeze({
  "client-gateway.protocol": CLIENT_GATEWAY_PROTOCOL_VERSION,
  "client-gateway.trace-schema": String(CLIENT_GATEWAY_TRACE_SCHEMA_VERSION),
  "client-gateway.trace-capture-boundary": String(CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION)
});
