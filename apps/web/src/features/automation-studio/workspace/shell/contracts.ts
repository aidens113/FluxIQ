import type { ReactNode } from "react";
import type { AutomationViewInstance } from "../../views/view-types";
import type { AutomationViewHostRequest } from "../../views/view-host-types";
import type { AutomationWorkspaceArea } from "../layout/contracts";

export type AutomationWorkspaceBreadcrumb = {
  id: string;
  kind: "project" | "flow" | "subflow" | "view";
  label: string;
  current?: boolean;
};

export type AutomationWorkspaceHeaderCommands = {
  closeProject(): void;
  activateBreadcrumb(crumb: AutomationWorkspaceBreadcrumb): void;
  openDataInspector(): void;
  openPreferences(): void;
};

export type AutomationWorkspaceChromeCommands = {
  openLayoutPicker(area: AutomationWorkspaceArea, anchor: DOMRect): void;
  openViewAdder(area: AutomationWorkspaceArea, targetPaneId: string, anchor: DOMRect): void;
  setNarrowPanel(panel: "hierarchy" | "inspector" | "timeline" | null): void;
};

export type AutomationWorkspaceShellSurfaces = {
  hierarchy: ReactNode;
  timeline: ReactNode;
};

export type AutomationWorkspaceViewEntry = {
  request: AutomationViewHostRequest;
  view: AutomationViewInstance;
  bodyClassName?: string;
};

export type AutomationWorkspaceViewSource = {
  get(viewId: string): AutomationWorkspaceViewEntry | null;
  getRevision(viewId: string): number;
  replace(viewId: string, entry: AutomationWorkspaceViewEntry | null): boolean;
  subscribe(viewId: string, listener: () => void): () => void;
};
