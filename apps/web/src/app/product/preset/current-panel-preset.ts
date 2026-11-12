import type { PanelPreset } from "./panel-presets";
import { resolvePanelPreset } from "./resolve-panel-preset";

/** The panel's preset for this deployment (FLUXIQ_PANEL_PRESET). Server only; throws on an unknown preset. */
export function currentPanelPreset(): PanelPreset {
  return resolvePanelPreset(process.env.FLUXIQ_PANEL_PRESET);
}
