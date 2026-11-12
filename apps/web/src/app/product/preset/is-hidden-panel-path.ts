import { PANEL_NAV_ITEMS } from "../../../features/panel-shell/nav/items";
import type { PanelPreset } from "./panel-presets";

/**
 * True for a path the deployment's preset hides: a screen it does not list
 * (and everything under that screen), or `/settings/<id>` for a Settings tool
 * it does not list. The middleware answers these 404 before rendering starts:
 * a page's own `notFound()` streams under the root loading boundary, which has
 * already sent status 200.
 */
export function isHiddenPanelPath(pathname: string, preset: PanelPreset): boolean {
  const screen = PANEL_NAV_ITEMS.find((item) => item.href !== "/" && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  if (screen && !preset.pages.includes(screen.page)) return true;
  const tool = /^\/settings\/([^/]+)/u.exec(pathname)?.[1];
  return tool !== undefined && !preset.settingsTools.includes(decodeURIComponent(tool));
}
