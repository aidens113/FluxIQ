// The variable a deployment sets to trace client gateway episodes (D11). Read
// once by the host that constructs the service (`programs/_shared/runtime.ts`).
// Unset is the product's configuration: no capture source and no work. The Lab
// sets it on for every Core it starts.

/** The variable the Core process reads to switch client gateway tracing on. */
export const AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_ENV = "FLUXIQ_CLIENT_GATEWAY_TRACE";
