import type { ReactNode } from "react";
import type {
  AutomationLayoutPickerState,
  AutomationLayoutPreset,
  AutomationWindowAdderState,
  AutomationWorkspaceArea,
  AutomationWorkspacePrefs
} from "../layout/contracts";
import type { AutomationViewAdderOption } from "../view-adder";

export type OverlayCommandStatus = {
  pending: boolean;
  error: string | null;
};

export type PreferencesOverlayRequest = {
  id: string;
  prefs: AutomationWorkspacePrefs;
  saveStatus: string;
};

export type PreferencesOverlayCommand = {
  type: "workspace.preferences.replace";
  requestId: string;
  prefs: AutomationWorkspacePrefs;
};

export type ViewAdderOverlayRequest = AutomationWindowAdderState & {
  id: string;
  options: readonly AutomationViewAdderOption[];
};

export type ViewAdderOverlayCommand = {
  type: "workspace.view.add";
  requestId: string;
  viewId: string;
  area: AutomationWorkspaceArea;
  targetWindowId?: string;
};

export type LayoutPickerOverlayRequest = AutomationLayoutPickerState & {
  id: string;
};

export type LayoutPickerOverlayCommand = {
  type: "workspace.layout.arrange";
  requestId: string;
  area: AutomationWorkspaceArea;
  preset: AutomationLayoutPreset;
};

export type DataInspectorOverlayRequest = {
  id: string;
  activeProjectId: string | null;
};

export type InspectorDrawerRequest = {
  id: string;
  title: string;
};

export type WorkspaceDrawerRequest = {
  id: string;
  kind: "hierarchy" | "timeline";
  title: string;
};

export type AutomationStudioOverlayState = {
  preferences: PreferencesOverlayRequest | null;
  viewAdder: ViewAdderOverlayRequest | null;
  layoutPicker: LayoutPickerOverlayRequest | null;
  dataInspector: DataInspectorOverlayRequest | null;
  inspectorDrawer: InspectorDrawerRequest | null;
  drawer: WorkspaceDrawerRequest | null;
};

export type OverlaySurfaceChildren = {
  children: ReactNode;
};