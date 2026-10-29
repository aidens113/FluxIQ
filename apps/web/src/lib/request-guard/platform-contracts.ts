// The pure platform contracts the request guard and discovery use. The web app
// does not list `@fluxiq/contracts` as a dependency, so they come through
// Core's edge-safe `fluxiq/platform/profile` subpath, which re-exports them.
export {
  CLIENT_GATEWAY_PROTOCOL_VERSIONS,
  FLUXIQ_CONNECT_PATHS,
  FLUXIQ_DISCOVERY_MAX_AGE_SECONDS,
  fluxiqDiscoveryDocumentSchema,
  parseFluxIQDiscoveryDocument
} from "fluxiq/platform/profile";
