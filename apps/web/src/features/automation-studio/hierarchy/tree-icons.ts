import {
  Bug,
  ClipboardList,
  FileCode2,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  ListChecks,
  Network,
  Radio,
  Route,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  type LucideIcon
} from "lucide-react";
import { automationStudioViewId } from "../views/view-registry";
import type { AutomationHierarchyNode } from "./contracts";

export function automationHierarchyIconForNode(node: AutomationHierarchyNode): LucideIcon {
  if (node.kind === "folder") {
    if (node.viewId === automationStudioViewId.recordingTimeline) return Radio;
    if (node.viewId === "proposal-workbench") return Sparkles;
    if (node.viewId === "runs-history") return History;
    if (node.viewId === automationStudioViewId.adaptations) return ClipboardList;
    if (node.label === "Subflows") return Workflow;
    return FolderOpen;
  }
  if (node.viewId === automationStudioViewId.instructions || node.kind === "instruction") return ListChecks;
  if (node.kind === "change-proposal" || node.kind === "proposal") return Sparkles;
  if (node.viewId === automationStudioViewId.runtime) return Bug;
  if (node.viewId === automationStudioViewId.state || node.metadata?.flowStructure === "subflow-nodes") return Network;
  if (node.viewId === automationStudioViewId.settings) return Settings;
  if (node.kind === "subflow" || node.kind === "routine") return Workflow;
  if (node.kind === "recording" || node.kind === "client") return Radio;
  if (node.kind === "run") return History;
  if (node.kind === "config") return SlidersHorizontal;
  if (node.kind === "task") return FileCode2;
  if (node.viewId === automationStudioViewId.router) return Route;
  if (node.kind === "flow") return GitBranch;
  return FileText;
}