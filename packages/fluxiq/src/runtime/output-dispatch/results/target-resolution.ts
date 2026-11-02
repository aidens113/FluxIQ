import type { AutomationNodeTargetResolution } from "../../../components/automation/index.ts";
export function targetResolutionField(resolution: AutomationNodeTargetResolution | undefined): {
  targetResolution?: AutomationNodeTargetResolution;
} {
  return resolution ? { targetResolution: resolution } : {};
}
