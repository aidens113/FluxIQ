import type { AutomationRecording, AutomationTask, DynamicPolicyArtifact } from "../types";
import type { LearnedTaskModel } from "../learning";
import type { NormalizedTimeline } from "../normalization";
import type { PolicyGraph, RecordingSession, SignalRegistry } from "../model";
import type { JsonObject } from "../../../core";

export const AUTOMATION_STUDIO_ENDPOINTS = {
  snapshot: "snapshot",
  projects: "projects",
  createProject: "create-project",
  updateProject: "update-project",
  deleteProject: "delete-project",
  createProjectCategory: "create-project-category",
  updateProjectCategory: "update-project-category",
  deleteProjectCategory: "delete-project-category",
  reorderProjectCategories: "reorder-project-categories",
  getProjectHierarchy: "get-project-hierarchy",
  saveProjectHierarchy: "save-project-hierarchy"
} as const;

export type AutomationStudioProject = {
  id: string;
  name: string;
  description: string;
  categoryId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioProjectCategory = {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioHierarchyNode = {
  id: string;
  label: string;
  kind: "folder" | "task" | "routine" | "config";
  category: "task" | "routine" | "config";
  parentId: string | null;
  viewId?: string;
  sourceId?: string;
};

export type AutomationStudioProjectHierarchy = {
  customHierarchyNodes: AutomationStudioHierarchyNode[];
  deletedHierarchyIds: string[];
  workspacePrefs: JsonObject;
};

export type AutomationStudioSnapshot = {
  tasks: AutomationTask[];
  recordings: AutomationRecording[];
  policies: DynamicPolicyArtifact[];
  canonical?: {
    recordingSessions: RecordingSession[];
    normalizedTimelines: NormalizedTimeline[];
    signalRegistries: SignalRegistry[];
    learnedTaskModels: LearnedTaskModel[];
    policyGraphs: PolicyGraph[];
  };
  problems?: AutomationStudioProblem[];
};

export type AutomationStudioProblem = {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  artifactKind?: string;
  artifactId?: string;
};

export type GeneratePolicyRequest = {
  taskId: string;
  domainId?: string | null;
  recordingIds?: string[];
};

export type GeneratePolicyResponse = {
  policy: DynamicPolicyArtifact;
  warnings: string[];
};
