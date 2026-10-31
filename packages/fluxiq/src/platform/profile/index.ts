// Barrel for deployment profile resolution (hosted lane A): every setting from the environment, pure.
export type { FluxIQDeploymentSettings } from "./types.ts";
export { resolveFluxIQDeploymentSettings, resolveFluxIQProfile, resolveClientAddress } from "./resolve/index.ts";
export { clientAddressPrefix } from "./client-address-prefix.ts";
// The pure platform contracts the web layer needs at runtime. apps/web does
// not depend on `@fluxiq/contracts` directly, and the gateway server bundle
// keeps `fluxiq/*` external, so they are reached through this edge-safe subpath.
export {
  admitClientGatewayOrigin,
  clientGatewayOriginStartRefusal,
  isPublicClientGatewayBind,
  parseClientGatewayOriginAllowlist,
  FLUXIQ_CONNECT_PATHS,
  CLIENT_GATEWAY_PROTOCOL_VERSIONS,
  FLUXIQ_DISCOVERY_MAX_AGE_SECONDS,
  fluxiqDiscoveryDocumentSchema,
  parseFluxIQDiscoveryDocument
} from "@fluxiq/contracts/platform";
