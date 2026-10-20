// The versions a trace records about its own shape and capture boundary. A
// reader compares them before trusting a trace (see evaluate-completeness.ts).

/** The trace manifest and event envelope shape. Bump on any incompatible change. */
export const CLIENT_GATEWAY_TRACE_SCHEMA_VERSION = 1;

/**
 * Where the copies are taken: raw inbound text before parsing, structured
 * outbound copies at the transport, lifecycle, dispositions and Core-synthesized
 * outcomes as further events, on one delivery sequence assigned on entry.
 */
export const CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION = 1;
