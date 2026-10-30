import type { PanelProduct } from "@fluxiq/contracts/platform";
import { contrastRatio } from "./contrast-ratio.ts";
import { PANEL_BRAND_SURFACES } from "./surfaces.ts";

const TEXT_MINIMUM = 4.5;
const FOCUS_MINIMUM = 3;

/**
 * Checks each accent mode the product gives: `primary` and `primaryHover`
 * carry text of the surface colour (at least 4.5 against the surface), and
 * `focus` must stand out (at least 3) against the surface and the background.
 */
export function checkPanelBrandContrast(product: PanelProduct): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const mode of ["light", "dark"] as const) {
    const accent = product.brand?.[mode];
    if (!accent) continue;
    const { surface, background } = PANEL_BRAND_SURFACES[mode];
    const require = (name: string, color: string, against: string, minimum: number): void => {
      const ratio = contrastRatio(color, against);
      if (ratio < minimum) failures.push(`brand.${mode}.${name} ${color} has contrast ${ratio.toFixed(2)} against ${against}; at least ${minimum} is required`);
    };
    require("primary", accent.primary, surface, TEXT_MINIMUM);
    require("primaryHover", accent.primaryHover, surface, TEXT_MINIMUM);
    require("focus", accent.focus, surface, FOCUS_MINIMUM);
    require("focus", accent.focus, background, FOCUS_MINIMUM);
  }
  return { ok: failures.length === 0, failures };
}
