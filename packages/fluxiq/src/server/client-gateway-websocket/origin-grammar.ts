// The client gateway's Origin grammar is the platform contract's
// (`@fluxiq/contracts/platform`, `packages/contracts/src/platform/origin/`),
// taken through `platform/profile`, which re-exports it: the same module the
// transport read while it lived in `apps/web`, which reaches the contracts only
// through a `fluxiq` subpath. This is the one place the transport names where
// the grammar comes from.
export {
  admitClientGatewayOrigin,
  clientGatewayOriginStartRefusal,
  isPublicClientGatewayBind,
  parseClientGatewayOriginAllowlist
} from "../../platform/profile/index.ts";
