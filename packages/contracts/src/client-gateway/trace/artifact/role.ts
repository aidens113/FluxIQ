/** `primary`: the observation itself; `resource`: something the primary artifact refers to, stored once per digest. */
export const CLIENT_GATEWAY_TRACE_ARTIFACT_ROLES = Object.freeze(["primary", "resource"] as const);
export type ClientGatewayTraceArtifactRole = (typeof CLIENT_GATEWAY_TRACE_ARTIFACT_ROLES)[number];
