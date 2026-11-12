import { SETTINGS_TOOLS, type EngineTool } from "../../../features/settings-page/model";
import type { PanelPreset } from "./panel-presets";

/** The Settings tools a preset lists, in Settings' own order. Server helper for the Settings page and its `/settings/<id>` route. */
export function settingsToolsForPreset(preset: PanelPreset): readonly EngineTool[] {
  return SETTINGS_TOOLS.filter((tool) => preset.settingsTools.includes(tool.id));
}
