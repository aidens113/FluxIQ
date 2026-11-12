import { notFound } from "next/navigation";
import type { EngineTool } from "../../../features/settings-page/model";
import { currentPanelPreset } from "./current-panel-preset";
import { settingsToolsForPreset } from "./settings-tools-for-preset";

/** `/settings/<id>` guard: a tool the preset does not list answers not-found; returns the tool otherwise. */
export function requirePanelSettingsTool(id: string): EngineTool {
  const tool = settingsToolsForPreset(currentPanelPreset()).find((candidate) => candidate.id === id);
  if (!tool) notFound();
  return tool;
}
