/**
 * Traces (traces and offline trials, P2). Core marks an action command it is
 * tracing with `metadata.trace` (`ClientGatewayTraceRequest`): the client may
 * then upload artifacts of what it observed for that command -- content
 * addressed, PUT to `CLIENT_GATEWAY_TRACE_ARTIFACT_PATH/<sha256>` with its
 * bearer token -- and reference them from its result's `metadata.trace`
 * (`ClientGatewayTraceResultMetadata`). Core records the reference in the trace
 * and takes it off the result before any consumer reads it, so nothing traced
 * ever reaches a run, a recording or a model. A client that cannot capture
 * ignores the request; its result simply carries no reference. Never a
 * top-level key: the durable path refuses a result with an unknown one.
 */
export const CLIENT_GATEWAY_TRACE_METADATA_KEY = "trace";
