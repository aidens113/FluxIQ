// The streams the gateway tap records into. A trace the gateway records
// through declares both when it is opened (`ClientGatewayTraceRecorderStart.
// streams`); an event on an undeclared stream is declared lost by the recorder.

export const CLIENT_GATEWAY_TRACE_TAP_STREAMS = Object.freeze({
  /** Messages both ways, their dispositions, lifecycle and Core-synthesized outcomes. */
  gateway: "gateway",
  /** Trace artifacts a client uploaded for a traced command. */
  artifact: "artifact"
} as const);
