"use client";

import type { ReactNode } from "react";
import { PublishPanelPage } from "../../panel-shell";
import "../security.css";
import { SecurityTabs } from "./SecurityTabs";
import type { SecurityTabId } from "./security-tabs";

/** One place under Security: the heading, the tab bar with this tab marked, and the tab's content. */
export function SecurityTabPage(props: { active: SecurityTabId; children: ReactNode }) {
  return (
    <div className="security">
      <PublishPanelPage page="security" selection={{}} />
      <h1>Security</h1>
      <SecurityTabs active={props.active} />
      {props.children}
    </div>
  );
}
