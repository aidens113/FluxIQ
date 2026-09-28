import {
  FileCode2,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  Image,
  MonitorSmartphone,
  Play,
  Puzzle,
  Radio,
  Route,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  type LucideIcon
} from "lucide-react";
import { automationStudioViewId } from "../views/view-registry";
import type { AutomationHierarchyNode } from "./contracts";

/**
 * A tree row carries the same icon as the tab it opens, so the sidebar and the tab
 * strip name one destination the same way twice.
 */
export function automationHierarchyIconForNode(node: AutomationHierarchyNode): LucideIcon {
  if (node.kind === "folder") {
    if (node.viewId === automationStudioViewId.recordingTimeline) return Radio;
    if (node.viewId === "proposal-workbench") return Sparkles;
    if (node.viewId === "runs-history") return History;
    if (node.viewId === automationStudioViewId.adaptations) return Sparkles;
    if (node.metadata?.flowStructure === "subflows") return Puzzle;
    return FolderOpen;
  }
  if (node.viewId === automationStudioViewId.instructions || node.kind === "instruction") return ScrollText;
  if (node.kind === "change-proposal" || node.kind === "proposal") return Sparkles;
  if (node.viewId === automationStudioViewId.runtime) return Play;
  if (node.metadata?.flowStructure === "subflow-nodes") return Workflow;
  if (node.viewId === automationStudioViewId.state) return Image;
  if (node.viewId === automationStudioViewId.settings) return Settings;
  if (node.kind === "subflow" || node.kind === "routine") return Puzzle;
  if (node.kind === "recording") return Radio;
  if (node.kind === "client") return MonitorSmartphone;
  if (node.kind === "run") return History;
  if (node.kind === "config") return SlidersHorizontal;
  if (node.kind === "task") return FileCode2;
  if (node.viewId === automationStudioViewId.router) return Route;
  if (node.kind === "flow") return GitBranch;
  return FileText;
}
