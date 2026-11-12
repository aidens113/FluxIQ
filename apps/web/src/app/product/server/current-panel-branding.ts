import { getPlatformRegistry, panelBranding, type PanelBranding } from "fluxiq/platform/panel";
import { accentTokens } from "./accent-tokens";
import { ensurePlatformModulesLoaded } from "./ensure-platform-modules-loaded";

/** The panel's branding for this request: the registered product's, or stock FluxIQ, with its accent on the panel's own tokens. Server only. */
export async function currentPanelBranding(): Promise<PanelBranding> {
  await ensurePlatformModulesLoaded();
  const branding = panelBranding(getPlatformRegistry().product());
  return { ...branding, style: accentTokens(branding.style) };
}
