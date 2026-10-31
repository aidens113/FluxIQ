import type { PanelBranding } from "fluxiq/platform/panel";

/**
 * The stock branding as plain data, equal to `panelBranding(null)` (a test
 * holds them together). Client components start from it, and import only the
 * type, so the host module loader never reaches the browser bundle.
 */
export const STOCK_PANEL_BRANDING: PanelBranding = {
  name: "FluxIQ",
  shortName: "FluxIQ",
  logoUrl: null,
  faviconUrl: null,
  signInArtUrl: null,
  style: {},
  links: {},
  signInTitle: null,
  signInMessage: null,
  signUpUrl: null
};
