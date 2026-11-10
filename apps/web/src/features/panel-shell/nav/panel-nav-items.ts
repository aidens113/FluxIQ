import type { PanelPage } from "../context";

export type PanelNavItem = { page: PanelPage; label: string; href: string; hint: string };

/** The six places in the panel, in the order they are shown. */
export const PANEL_NAV_ITEMS: readonly PanelNavItem[] = [
  { page: "home", label: "Home", href: "/", hint: "What is happening now" },
  { page: "flows", label: "Flows", href: "/flows", hint: "Your Flows and folders" },
  { page: "runs", label: "Runs", href: "/runs", hint: "What ran, and how it went" },
  { page: "data", label: "Data", href: "/data", hint: "What your Flows collected" },
  { page: "security", label: "Security", href: "/security", hint: "Keys, access and activity" },
  { page: "settings", label: "Settings", href: "/settings", hint: "AI keys, budgets and setup" }
];

/** The item a path belongs to: `/flows/abc` is Flows, `/` only Home. */
export function navItemForPath(pathname: string): PanelNavItem | undefined {
  return PANEL_NAV_ITEMS.find((item) => (item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)));
}
