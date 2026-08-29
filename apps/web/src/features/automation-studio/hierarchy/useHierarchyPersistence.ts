"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ProgramCommandTransport } from "../data/program-transport";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import { persistentAutomationWorkspacePrefs } from "../model/workspace-persistence";
import type { AutomationHierarchyNode } from "./contracts";
import { automationHierarchySignature } from "./signature";

type HierarchyPersistenceOptions = {
  transport: ProgramCommandTransport;
  projectId: string | null;
  loadedProjectId: string | null;
  customNodes: readonly AutomationHierarchyNode[];
  deletedIds: readonly string[];
  workspacePrefs: AutomationWorkspacePrefs;
  saveRevision: number;
  setSaveStatus(message: string): void;
  reportSaveError(message: string): void;
};

export function useHierarchyPersistence(options: HierarchyPersistenceOptions): {
  markPersisted(input: {
    customNodes: readonly AutomationHierarchyNode[];
    deletedIds: readonly string[];
    workspacePrefs: AutomationWorkspacePrefs;
  }): void;
  resetPersisted(): void;
} {
  const persistedSignatureRef = useRef("");

  useEffect(() => {
    if (!options.projectId || options.loadedProjectId !== options.projectId) return;
    const durablePrefs = persistentAutomationWorkspacePrefs(options.workspacePrefs);
    const signature = automationHierarchySignature(options.customNodes, options.deletedIds, durablePrefs);
    if (signature === persistedSignatureRef.current) return;

    const timeout = window.setTimeout(() => {
      if (signature === persistedSignatureRef.current) return;
      options.setSaveStatus("Saving workspace changes...");
      void options.transport.post("save-project-hierarchy", {
        projectId: options.projectId,
        hierarchy: {
          customHierarchyNodes: options.customNodes,
          deletedHierarchyIds: options.deletedIds,
          workspacePrefs: durablePrefs
        }
      }).then((result) => {
        if (result.ok) {
          persistedSignatureRef.current = signature;
          options.setSaveStatus("All workspace changes saved");
          return;
        }
        const message = result.error ?? "Workspace changes could not be saved.";
        options.setSaveStatus("Save failed: " + message);
        options.reportSaveError(message);
      });
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [
    options.projectId,
    options.loadedProjectId,
    options.customNodes,
    options.deletedIds,
    options.workspacePrefs,
    options.saveRevision,
    options.transport,
    options.setSaveStatus,
    options.reportSaveError
  ]);

  const markPersisted = useCallback((input: {
    customNodes: readonly AutomationHierarchyNode[];
    deletedIds: readonly string[];
    workspacePrefs: AutomationWorkspacePrefs;
  }) => {
    persistedSignatureRef.current = automationHierarchySignature(
      input.customNodes,
      input.deletedIds,
      persistentAutomationWorkspacePrefs(input.workspacePrefs)
    );
  }, []);

  const resetPersisted = useCallback(() => {
    persistedSignatureRef.current = "";
  }, []);

  return { markPersisted, resetPersisted };
}