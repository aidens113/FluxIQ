import type { AutomationViewInstance } from "../../views/view-types";
import { automationStudioViewDefinition } from "../../views/view-registry";

export function viewTitle(view: AutomationViewInstance): string {
  const canonical = automationStudioViewDefinition(view.id, { hasFlow: true });
  if (canonical) return canonical.label;
  if (view.type === "design") return "Flow";
  if (view.type === "recordings") return "Timeline";
  if (view.type === "proposal") return "Adaptations";
  if (view.type === "proposal-generator") return "Adaptations";
  if (view.type === "runtime") return "Runtime Debug";
  if (view.type === "problems") return "Problems";
  if (view.type === "subflows") return "Subflows";
  if (view.type === "clients") return "Connected Clients";
  if (view.type === "runs") return "Runs";
  if (view.type === "router") return "Router";
  if (view.type === "adaptations") return "Adaptations";
  if (view.type === "instructions") return "Instructions";
  if (view.type === "settings") return "Settings";
  if (view.type === "state") return "State View";
  if (view.type === "inspector") return "Inspector";
  if (view.type === "routine") return "Legacy Routine (read-only)";
  if (view.type === "config") return "Flow Settings";
  return "State Explorer";
}


export function automationWindowDescription(view: AutomationViewInstance): string {
  if (view.type === "design") return "Edit Flow nodes and edges.";
  if (view.type === "routine") return "Build routine orchestration graphs.";
  if (view.type === "config") return "Open this saved tab in the supported Flow Settings surface.";
  if (view.type === "recordings") return "Review raw timeline evidence and notes.";
  if (view.type === "proposal") return "Review this imported record in Adaptations.";
  if (view.type === "proposal-generator") return "Review this imported record in Adaptations.";
  if (view.type === "runtime") return "Inspect live/debug execution state.";
  if (view.type === "runs") return "Inspect replay and validation history.";
  if (view.type === "router") return "Edit route rules, groups, fallback, and targets.";
  if (view.type === "subflows") return "Inspect and manage reusable Flow subflows.";
  if (view.type === "adaptations") return "Review and promote runtime adaptations.";
  if (view.type === "instructions") return "Manage scoped LLM instructions.";
  if (view.type === "settings") return "Tune Flow training and approval settings.";
  if (view.type === "state") return "Reconstruct selected node state and evidence.";
  if (view.type === "clients") return "Pair remote recorder and action clients.";
  if (view.type === "problems") return "Review validation and authoring issues.";
  if (view.type === "inspector") return "Inspect the current global selection.";
  return "Open this workspace view.";
}

