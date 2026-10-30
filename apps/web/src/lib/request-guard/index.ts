// Barrel for the request guard the edge middleware applies.
export { isCrossSiteRequest } from "./is-cross-site-request";
export type { CrossSiteInput } from "./is-cross-site-request";
export { isOperatorOnlyPath } from "./is-operator-only-path";
export { CLIENT_GATEWAY_PROTOCOL_VERSIONS, FLUXIQ_CONNECT_PATHS, FLUXIQ_DISCOVERY_MAX_AGE_SECONDS, fluxiqDiscoveryDocumentSchema, parseFluxIQDiscoveryDocument } from "./platform-contracts";
