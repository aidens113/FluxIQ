import { notFound } from "next/navigation";
import type { PanelPage } from "../../../features/panel-shell/context";
import { currentPanelPreset } from "./current-panel-preset";

/** Page guard: a screen the deployment's preset hides answers not-found, so hidden means off, not only unlinked. */
export function requirePanelScreen(page: PanelPage): void {
  if (!currentPanelPreset().pages.includes(page)) notFound();
}
