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

export type ProjectOverlayTarget = {
  id: string;
  name: string;
  description?: string;
  categoryId?: string | null;
};

export type ProjectCategoryOverlayTarget = {
  id: string;
  name: string;
};

export type ProjectOverlayRequest =
  | { id: string; kind: "create-project"; categoryId: string | null }
  | { id: string; kind: "edit-project"; project: ProjectOverlayTarget }
  | { id: string; kind: "delete-project"; project: ProjectOverlayTarget }
  | { id: string; kind: "move-project"; project: ProjectOverlayTarget; destination: ProjectCategoryOverlayTarget | null }
  | { id: string; kind: "create-category" }
  | { id: string; kind: "rename-category"; category: ProjectCategoryOverlayTarget }
  | { id: string; kind: "delete-category"; category: ProjectCategoryOverlayTarget }
  | { id: string; kind: "move-category"; category: ProjectCategoryOverlayTarget; before: ProjectCategoryOverlayTarget };

export type ProjectOverlayCommand =
  | { type: "project.create"; requestId: string; name: string; description: string; categoryId: string | null; pin: string }
  | { type: "project.update"; requestId: string; projectId: string; name: string; description: string; pin: string }
  | { type: "project.delete"; requestId: string; projectId: string; pin: string }
  | { type: "project.move"; requestId: string; projectId: string; categoryId: string | null; pin: string }
  | { type: "project-category.create"; requestId: string; name: string; pin: string }
  | { type: "project-category.rename"; requestId: string; categoryId: string; name: string; pin: string }
  | { type: "project-category.delete"; requestId: string; categoryId: string; pin: string }
  | { type: "project-category.move"; requestId: string; categoryId: string; beforeCategoryId: string; pin: string };

export type HierarchyItemKind = "flow" | "folder" | "subflow";

export type HierarchyFolderOption = {
  id: string;
  label: string;
};

export type HierarchyFolderOptionSource = {
  resolve(id: string): HierarchyFolderOption | null;
  search(query: string, limit: number): readonly HierarchyFolderOption[];
};

export type HierarchyOverlayRequest =
  | {
      id: string;
      kind: "create";
      category: string;
      categoryLabel: string;
      parentId: string | null;
      allowedKinds: readonly HierarchyItemKind[];
      folderSource: HierarchyFolderOptionSource;
      subflowContainer: boolean;
    }
  | {
      id: string;
      kind: "delete";
      node: { id: string; label: string; kind: string };
    };

export type HierarchyOverlayCommand =
  | {
      type: "hierarchy.create";
      requestId: string;
      category: string;
      itemKind: HierarchyItemKind;
      name: string;
      parentId: string | null;
      flowOrigin: FlowOrigin;
      pin: string;
    }
  | {
      type: "hierarchy.delete";
      requestId: string;
      nodeId: string;
      pin: string;
    };

export type FlowOrigin =
  | "blank"
  | "deterministic"
  | "recorded"
  | "integration"
  | "scheduled"
  | "api-endpoint"
  | "reusable";

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
  project: ProjectOverlayRequest | null;
  hierarchy: HierarchyOverlayRequest | null;
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