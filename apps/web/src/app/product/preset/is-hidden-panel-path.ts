import { PANEL_NAV_ITEMS } from "../../../features/panel-shell/nav/items";
import type { PanelPreset } from "./panel-presets";

/**
 * The panel's own pages under `/settings`: routes of their own (the Advanced security tools, such as Saved logins),
 * not preset tools. Listed here so the middleware bundle carries no Settings code; a test keeps it equal to the
 * Settings page's own list (`SECURITY_TOOLS` hrefs under `/settings/`).
 */
export const OWN_SETTINGS_PAGES: readonly string[] = ["/settings/saved-logins"];

/**
 * True for a path the deployment's preset hides: a screen it does not list
 * (and everything under that screen), or `/settings/<id>` for a Settings tool
 * it does not list. The panel's own settings pages (`/settings/saved-logins`)
 * are not preset tools and always pass. The middleware answers these 404
 * before rendering starts: a page's own `notFound()` streams under the root
 * loading boundary, which has already sent status 200.
 */
export function isHiddenPanelPath(pathname: string, preset: PanelPreset): boolean {
  const screen = PANEL_NAV_ITEMS.find((item) => item.href !== "/" && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  if (screen && !preset.pages.includes(screen.page)) return true;
  if (OWN_SETTINGS_PAGES.some((href) => pathname === href || pathname.startsWith(`${href}/`))) return false;
  const tool = /^\/settings\/([^/]+)/u.exec(pathname)?.[1];
  return tool !== undefined && !preset.settingsTools.includes(decodeURIComponent(tool));
}
