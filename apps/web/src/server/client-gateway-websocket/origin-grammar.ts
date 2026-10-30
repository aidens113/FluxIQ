// The client gateway's Origin grammar is the platform contract's
// (`@fluxiq/contracts/platform`, `packages/contracts/src/platform/origin/`).
// The web app reaches `@fluxiq/contracts` only through a `fluxiq` subpath:
// it does not list the contracts package as a dependency, and the gateway
// server bundle keeps `fluxiq/*` external while refusing to bundle any source
// outside its declared inventory. So the grammar is taken from
// `fluxiq/platform/profile`, which re-exports it. This is the one place the
// transport names where the grammar comes from.
export {
  admitClientGatewayOrigin,
  clientGatewayOriginStartRefusal,
  isPublicClientGatewayBind,
  parseClientGatewayOriginAllowlist
} from "fluxiq/platform/profile";
