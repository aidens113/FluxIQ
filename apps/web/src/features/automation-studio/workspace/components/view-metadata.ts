import type { AutomationViewInstance } from "../../views/view-types";
import { automationStudioViewDefinition, automationStudioViewObjectId } from "../../views/view-registry";

export function viewTitle(view: AutomationViewInstance): string {
  if (automationStudioViewObjectId(view.id)) return view.label;
  const canonical = automationStudioViewDefinition(view.id, { hasFlow: true });
  if (canonical) return canonical.label;
  if (view.type === "design") return "Steps";
  if (view.type === "recordings") return "Recorded steps";
  if (view.type === "proposal") return "Suggested changes";
  if (view.type === "proposal-generator") return "Suggested changes";
  if (view.type === "runtime") return "Run and test";
  if (view.type === "problems") return "Problems";
  if (view.type === "subflows") return "Reusable parts";
  if (view.type === "clients") return "Connected browsers";
  if (view.type === "runs") return "Past runs";
  if (view.type === "router") return "Choose a path";
  if (view.type === "adaptations") return "Suggested changes";
  if (view.type === "instructions") return "Guidance for the assistant";
  if (view.type === "settings") return "Settings";
  if (view.type === "state") return "What the page looked like";
  if (view.type === "inspector") return "Details";
  if (view.type === "routine") return "Saved tab from an older version";
  if (view.type === "config") return "Settings";
  return "What the page looked like";
}


export function automationWindowDescription(view: AutomationViewInstance): string {
  if (view.type === "design") return "Add, remove and reorder the steps this part runs.";
  if (view.type === "routine") return "A tab saved by an older version of FluxIQ.";
  if (view.type === "config") return "Reopen this saved tab in Settings.";
  if (view.type === "recordings") return "Replay what was captured while you used the site.";
  if (view.type === "proposal") return "Review a change FluxIQ suggests.";
  if (view.type === "proposal-generator") return "Review a change FluxIQ suggests.";
  if (view.type === "runtime") return "Say what you want automated, run it, and read the result.";
  if (view.type === "runs") return "Look back at earlier runs and what they produced.";
  if (view.type === "router") return "Decide which part handles each run.";
  if (view.type === "subflows") return "Group steps you want to use in more than one place.";
  if (view.type === "adaptations") return "Approve or undo the fixes FluxIQ made on its own.";
  if (view.type === "instructions") return "Write notes telling FluxIQ how to handle this automation.";
  if (view.type === "settings") return "Change how this automation runs.";
  if (view.type === "state") return "See the page exactly as it was at a chosen step.";
  if (view.type === "clients") return "Connect a browser so FluxIQ can record and act in it.";
  if (view.type === "problems") return "See what would stop this automation from running.";
  if (view.type === "inspector") return "See the details of whatever you have selected.";
  return "Open this panel.";
}

