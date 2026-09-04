import type { ReactNode } from "react";
import type { InspectorWidgetModel } from "./widget-model";
import type { AutomationSelection } from "../shared/selection-contracts";

export type InspectorRow = [string, string];
export type InspectorSectionModel = { title: string; rows: InspectorRow[] };
export type InspectorPanelModel = {
  sections: InspectorSectionModel[];
  widgets?: InspectorWidgetModel[];
  /** High-priority interactive content rendered directly below the Inspector identity. */
  primaryContent?: ReactNode;
  customContent?: ReactNode;
  provenance?: { current: string; source: string };
};

export type InspectorIdentity = {
  title: string;
  label: string;
  id: string;
  breadcrumb: string[];
  href?: string;
  openLabel?: string;
};

export type InspectorReferenceOption = { id: string; label: string; detail?: string };
export type InspectorReferenceOptions = Partial<Record<
  "action" | "task" | "policy" | "routine" | "database-collection" | "variable" | "state",
  InspectorReferenceOption[]
>>;

export type InspectorFlowDependencySummary = {
  dependencies: number;
  usedBy: number;
  availableUpgrades: number;
};

export type InspectorPanelContext = {
  selection: AutomationSelection;
  policy: any;
  flow: any;
  node: any;
  recording: any;
  entry: any;
  signal: any;
  timelineEntries: any[];
  flowPublicationCount: number;
  flowDependencies: InspectorFlowDependencySummary;
  referenceOptions: InspectorReferenceOptions;
  statePanel: InspectorPanelModel | null;
};

export type InspectorSelectionKind = AutomationSelection["kind"];
export type InspectorPanelContextFor<Kind extends InspectorSelectionKind> = Omit<InspectorPanelContext, "selection"> & {
  selection: Extract<AutomationSelection, { kind: Kind }>;
};
export type InspectorPanelBuilder<Kind extends InspectorSelectionKind = InspectorSelectionKind> =
  (context: InspectorPanelContextFor<Kind>) => InspectorPanelModel;
export type InspectorPanelRegistry = {
  [Kind in InspectorSelectionKind]: InspectorPanelBuilder<Kind>;
};
export type InspectorScopedSelectors = {
  selection(selectionId: string): AutomationSelection | null;
  policy(selection: AutomationSelection): any;
  flow(selection: AutomationSelection): any;
  node(selection: AutomationSelection): any;
  recording(selection: AutomationSelection): any;
  entry(selection: AutomationSelection): any;
  signal(selection: AutomationSelection): any;
  timelineEntries(selection: AutomationSelection): any[];
  flowPublicationCount(selection: AutomationSelection): number;
  flowDependencies(selection: AutomationSelection): InspectorFlowDependencySummary;
  referenceOptions(selection: AutomationSelection): InspectorReferenceOptions;
  statePanel(selection: AutomationSelection): InspectorPanelModel | null;
};

