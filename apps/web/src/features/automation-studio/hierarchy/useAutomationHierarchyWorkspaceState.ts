"use client";

import { useState } from "react";
import type { AutomationHierarchyKind, AutomationHierarchyNode } from "./model";

export function useAutomationHierarchyWorkspaceState() {
  const [loadedProjectHierarchyId, setLoadedProjectHierarchyId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | AutomationHierarchyKind>("all");
  const [customHierarchyNodes, setCustomHierarchyNodes] = useState<AutomationHierarchyNode[]>([]);
  const [deletedHierarchyIds, setDeletedHierarchyIds] = useState<string[]>([]);
  return {
    loadedProjectHierarchyId, setLoadedProjectHierarchyId, projectSearch, setProjectSearch,
    projectTypeFilter, setProjectTypeFilter, customHierarchyNodes, setCustomHierarchyNodes,
    deletedHierarchyIds, setDeletedHierarchyIds
  };
}