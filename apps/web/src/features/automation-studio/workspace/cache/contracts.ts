import type { AutomationHierarchySidebarUiState } from "../../hierarchy/ui-coordinator";
import type { AutomationWorkspacePrefs } from "../layout";

export type AutomationStudioCachedUiState = {
  workspacePrefs?: AutomationWorkspacePrefs;
  sidebar?: AutomationHierarchySidebarUiState;
};

export type AutomationStudioUiCacheKind = keyof AutomationStudioCachedUiState;

export type AutomationStudioUiCacheEnvelope<T> = {
  schemaVersion: number;
  projectId: string;
  userId: string;
  kind: AutomationStudioUiCacheKind;
  updatedAt: number;
  value: T;
};

export interface AutomationStudioUiCacheBackend {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface AutomationStudioUiCacheTransport {
  post<T = unknown>(
    endpoint: string,
    payload: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<{ ok: boolean; payload?: T; error?: string; aborted?: boolean }>;
}

export type AutomationStudioUiCacheKeyParts = {
  projectId: string;
  userId: string;
  kind: AutomationStudioUiCacheKind;
};

export type AutomationStudioUiCachePort = {
  markProjectUiMutation(projectId: string): void;
  hydrateWorkspacePrefs(input: {
    projectId: string;
    userId: string;
    durablePrefs: AutomationWorkspacePrefs;
    onHydrate(prefs: AutomationWorkspacePrefs): void;
  }): void;
  hydrateSidebar(input: {
    projectId: string;
    userId: string;
    onHydrate(sidebar: AutomationHierarchySidebarUiState): void;
  }): void;
  scheduleWorkspacePrefsWrite(input: {
    projectId: string;
    userId: string;
    prefs: AutomationWorkspacePrefs;
    delayMs?: number;
  }): void;
  scheduleSidebarWrite(input: {
    projectId: string;
    userId: string;
    sidebar: AutomationHierarchySidebarUiState;
    delayMs?: number;
  }): void;
  cancelProject(projectId: string): void;
};