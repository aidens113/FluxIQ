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

type HierarchyNodeMutation =
  | { operation: "delete"; nodeId: string }
  | { operation: "put"; node: AutomationHierarchyNode };

export function useHierarchyPersistence(options: HierarchyPersistenceOptions): {
  markPersisted(input: {
    customNodes: readonly AutomationHierarchyNode[];
    deletedIds: readonly string[];
    workspacePrefs: AutomationWorkspacePrefs;
  }): void;
  resetPersisted(): void;
} {
  const persistedSignatureRef = useRef("");
  const persistedNodesRef = useRef<readonly AutomationHierarchyNode[]>([]);
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
        const mutations = hierarchyNodeMutations(persistedNodesRef.current, customNodes);
        if (mutations.length === 0) {
          persistedSignatureRef.current = signature;
          persistedNodesRef.current = snapshotHierarchyNodes(customNodes);
          current.setSaveStatus("All workspace changes saved");
          return;
        }
        current.setSaveStatus("Saving workspace changes...");
        void persistHierarchyNodeMutations(
          current,
          projectId,
          signature,
          mutations
        ).then((error) => {
          const latest = optionsRef.current;
          if (latest.projectId !== projectId || latest.loadedProjectId !== projectId) return;
          if (!error) {
            persistedSignatureRef.current = signature;
            persistedNodesRef.current = snapshotHierarchyNodes(customNodes);
            latest.setSaveStatus("All workspace changes saved");
            return;
          }
          latest.setSaveStatus("Save failed: " + error);
          latest.reportSaveError(error);
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
    persistedNodesRef.current = snapshotHierarchyNodes(input.customNodes);
    persistedSignatureRef.current = automationHierarchySignature(
      input.customNodes,
      input.deletedIds,
      persistentAutomationWorkspacePrefs(input.workspacePrefs)
    );
  }, []);

  const resetPersisted = useCallback(() => {
    persistedSignatureRef.current = "";
    persistedNodesRef.current = [];
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  return { markPersisted, resetPersisted };
}

function hierarchyNodeMutations(
  persistedNodes: readonly AutomationHierarchyNode[],
  currentNodes: readonly AutomationHierarchyNode[]
): HierarchyNodeMutation[] {
  const persistedById = new Map(persistedNodes.map((node) => [node.id, node]));
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  const deletions: HierarchyNodeMutation[] = persistedNodes
    .filter((node) => !currentById.has(node.id))
    .map((node) => ({ operation: "delete", nodeId: node.id }));
  const puts: HierarchyNodeMutation[] = currentNodes
    .filter((node) => {
      const persisted = persistedById.get(node.id);
      return !persisted || JSON.stringify(persisted) !== JSON.stringify(node);
    })
    .map((node) => ({ operation: "put", node }));
  return [...deletions, ...puts];
}

async function persistHierarchyNodeMutations(
  options: HierarchyPersistenceOptions,
  projectId: string,
  signature: string,
  mutations: readonly HierarchyNodeMutation[]
): Promise<string | null> {
  try {
    const results = await Promise.all(mutations.map(async (mutation) => {
      const nodeId = mutation.operation === "put" ? mutation.node.id : mutation.nodeId;
      const mutationId = hierarchyMutationId(projectId, mutation.operation, nodeId, signature);
      return mutation.operation === "put"
        ? options.transport.post("put-project-hierarchy-node", { projectId, node: mutation.node, mutationId })
        : options.transport.post("delete-project-hierarchy-node", { projectId, nodeId: mutation.nodeId, mutationId });
    }));
    const failed = results.find((result) => !result.ok);
    return failed ? failed.error ?? "Workspace changes could not be saved." : null;
  } catch (error) {
    return error instanceof Error ? error.message : "Workspace changes could not be saved.";
  }
}

function hierarchyMutationId(projectId: string, operation: HierarchyNodeMutation["operation"], nodeId: string, signature: string): string {
  const identity = `${projectId}\u0000${operation}\u0000${nodeId}\u0000${signature}`;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `hierarchy-${operation}-${(hash >>> 0).toString(36)}`;
}

function snapshotHierarchyNodes(nodes: readonly AutomationHierarchyNode[]): AutomationHierarchyNode[] {
  return JSON.parse(JSON.stringify(nodes)) as AutomationHierarchyNode[];
}
