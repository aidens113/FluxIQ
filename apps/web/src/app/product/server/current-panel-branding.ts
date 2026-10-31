import { getPlatformRegistry, panelBranding, type PanelBranding } from "fluxiq/platform/panel";
import { ensurePlatformModulesLoaded } from "./ensure-platform-modules-loaded";

/** The panel's branding for this request: the registered product's, or stock FluxIQ. Server only. */
export async function currentPanelBranding(): Promise<PanelBranding> {
  await ensurePlatformModulesLoaded();
  return panelBranding(getPlatformRegistry().product());
}
