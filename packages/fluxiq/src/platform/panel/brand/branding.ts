import { panelProductAssetUrl, type PanelProduct } from "@fluxiq/contracts/platform";
import { panelBrandStyle } from "./style.ts";
import type { PanelBranding } from "./types.ts";

/** Everything the panel's pages need to brand themselves; with no product, the stock values, so callers need no branches. */
export function panelBranding(product: PanelProduct | null): PanelBranding {
  const asset = (name: string | undefined): string | null => (name ? panelProductAssetUrl(name) : null);
  return {
    name: product?.name ?? "FluxIQ",
    shortName: product?.shortName ?? "FluxIQ",
    logoUrl: asset(product?.assets?.logo),
    faviconUrl: asset(product?.assets?.favicon),
    signInArtUrl: asset(product?.assets?.signInArt),
    style: panelBrandStyle(product),
    links: product?.links ?? {},
    signInTitle: product?.auth?.signInTitle ?? null,
    signInMessage: product?.auth?.signInMessage ?? null,
    signUpUrl: product?.auth?.signUpUrl ?? null
  };
}
