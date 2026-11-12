"use client";

// The six places, as a left rail on a wide screen and a bottom tab bar on a phone
// (the stylesheet moves it). One nav landmark either way.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PanelPage } from "../context";
import { PANEL_NAV_ITEMS, navItemForPath, navItemsForPages } from "./items";

export function PanelRail(props: { pages?: readonly PanelPage[] }) {
  const items = props.pages ? navItemsForPages(props.pages) : PANEL_NAV_ITEMS;
  const current = navItemForPath(usePathname() ?? "/");
  return (
    <nav className="panel-rail" aria-label="Main">
      <ul>
        {items.map((item) => (
          <li key={item.page}>
            <Link
              href={item.href}
              className="panel-rail-link"
              title={item.hint}
              {...(current?.page === item.page ? { "aria-current": "page" as const } : {})}
            >
              <span className="panel-rail-label">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
