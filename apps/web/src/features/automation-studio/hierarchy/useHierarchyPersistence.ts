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
  getCustomNodes(): readonly AutomationHierarchyNode[];
  getDeletedIds(): readonly string[];
  getWorkspacePrefs(): AutomationWorkspacePrefs;
  subscribeSaveRequests(listener: () => void): () => void;
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
  const optionsRef = useRef(options);
  const timeoutRef = useRef<number | null>(null);
  optionsRef.current = options;

  useEffect(() => {
    const scheduleSave = () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      const current = optionsRef.current;
      if (!current.projectId || current.loadedProjectId !== current.projectId) return;
      const projectId = current.projectId;
      const customNodes = current.getCustomNodes();
      const deletedIds = current.getDeletedIds();
      const durablePrefs = persistentAutomationWorkspacePrefs(current.getWorkspacePrefs());
      const signature = automationHierarchySignature(customNodes, deletedIds, durablePrefs);
      if (signature === persistedSignatureRef.current) return;
      current.setSaveStatus("Saving workspace changes...");
      void current.transport.post("save-project-hierarchy", {
        projectId,
        hierarchy: {
          customHierarchyNodes: customNodes,
          deletedHierarchyIds: deletedIds,
          workspacePrefs: durablePrefs
        }
      }).then((result) => {
        const latest = optionsRef.current;
        if (latest.projectId !== projectId) return;
        if (result.ok) {
          persistedSignatureRef.current = signature;
          latest.setSaveStatus("All workspace changes saved");
          return;
        }
        const message = result.error ?? "Workspace changes could not be saved.";
        latest.setSaveStatus("Save failed: " + message);
        latest.reportSaveError(message);
      });
      }, 800);
    };
    const unsubscribe = options.subscribeSaveRequests(scheduleSave);
    return () => {
      unsubscribe();
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [options.subscribeSaveRequests]);

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
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  return { markPersisted, resetPersisted };
}
