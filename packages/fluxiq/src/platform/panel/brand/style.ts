import type { PanelProduct } from "@fluxiq/contracts/platform";

/** The panel's accent tokens set from the product's light accents; `{}` without a brand. */
export function panelBrandStyle(product: PanelProduct | null): Record<string, string> {
  const light = product?.brand?.light;
  if (!light) return {};
  return { "--color-primary": light.primary, "--color-primary-hover": light.primaryHover, "--color-focus": light.focus };
}
