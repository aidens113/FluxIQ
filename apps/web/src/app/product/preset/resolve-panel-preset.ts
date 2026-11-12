import { DEFAULT_PANEL_PRESET_ID, PANEL_PRESETS, type PanelPreset } from "./panel-presets";

/** The preset an environment value names; an empty value is the default, an unknown name is a startup error. */
export function resolvePanelPreset(value: string | undefined): PanelPreset {
  const id = value?.trim() || DEFAULT_PANEL_PRESET_ID;
  const preset = Object.hasOwn(PANEL_PRESETS, id) ? PANEL_PRESETS[id] : undefined;
  if (!preset) throw new Error(`FLUXIQ_PANEL_PRESET "${id}" is not a panel preset. Use one of: ${Object.keys(PANEL_PRESETS).join(", ")}.`);
  return preset;
}
