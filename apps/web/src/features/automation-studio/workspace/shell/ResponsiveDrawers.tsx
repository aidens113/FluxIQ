"use client";

import type { ReactNode } from "react";
import { Drawer } from "../../../programs/shared-ui";
import type { AutomationWorkspaceChromeCommands } from "./contracts";

export function AutomationResponsiveDrawers(props: {
  chrome: AutomationWorkspaceChromeCommands;
  hierarchy: ReactNode;
  inspector: ReactNode;
  inspectorTitle: string;
  panel: "hierarchy" | "inspector" | "timeline" | null;
  timeline: ReactNode;
}) {
  const close = () => props.chrome.setNarrowPanel(null);
  if (props.panel === "hierarchy") {
    return (
      <Drawer closeOnEscape onClose={close} side="left" title="Project Hierarchy">
        <AutomationNarrowScrollRegion>{props.hierarchy}</AutomationNarrowScrollRegion>
      </Drawer>
    );
  }
  if (props.panel === "inspector") {
    return (
      <Drawer closeOnEscape onClose={close} side="right" title={props.inspectorTitle}>
        <AutomationNarrowScrollRegion>{props.inspector}</AutomationNarrowScrollRegion>
      </Drawer>
    );
  }
  if (props.panel === "timeline") {
    return (
      <Drawer className="automation-preview-sheet" closeOnEscape onClose={close} side="right" title="Action Preview">
        <AutomationNarrowScrollRegion>{props.timeline}</AutomationNarrowScrollRegion>
      </Drawer>
    );
  }
  return null;
}

export function AutomationNarrowScrollRegion(props: { children: ReactNode }) {
  return (
    <div className="automation-narrow-scroll-region" style={{ minHeight: 0, overflow: "auto", overscrollBehavior: "contain" }}>
      {props.children}
    </div>
  );
}
