// Barrel for the panel's extension points (hosted production plan, lane E):
// the registry host modules register into, branding, onboarding cards and the
// host module loader. The contract values are re-exported because apps/web and
// downstream products reach `@fluxiq/contracts` only through a fluxiq subpath.
export type * from "./types.ts";
export * from "./registry/index.ts";
export * from "./brand/index.ts";
export * from "./onboarding/index.ts";
export * from "./host-modules/index.ts";
export { panelProductSchema, panelProductAssetUrl, PANEL_PRODUCT_ASSET_PATH, defaultClientGatewayOriginAllowlist } from "@fluxiq/contracts/platform";
export type { PanelProduct } from "@fluxiq/contracts/platform";
