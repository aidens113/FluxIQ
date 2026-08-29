import type { Blocks } from "lucide-react";

export type AutomationStudioView =
  | "design"
  | "recordings"
  | "runtime"
  | "runs"
  | "router"
  | "subflows"
  | "instructions"
  | "adaptations"
  | "settings"
  | "problems";

export type AutomationViewType = AutomationStudioView | "clients" | "routine" | "state" | "inspector";

export type PersistedAutomationViewType = AutomationViewType | "config" | "proposal" | "proposal-generator";

export type AutomationViewInstance = {
  id: string;
  label: string;
  type: PersistedAutomationViewType;
  icon: typeof Blocks;
  state?: "dirty" | "live" | "warning";
};
