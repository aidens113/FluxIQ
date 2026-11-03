// Tells a run's control that recovery has taken over from its steps, so a
// person watching sees Adapting rather than Running.
//
// Recovery is reached with the run's graph options, not with the host's
// registry, so it marks the run through the gate those options carry. The run
// goes back to executing on its own at its next checkpoint: a repaired rerun
// is executing again the moment it takes a step.

import { AutomationStudioRunController } from "./run-controller.ts";
import type { AutomationStudioRunControlGate } from "./types.ts";

export function automationStudioMarkRunAdapting(gate: AutomationStudioRunControlGate | undefined): void {
  if (gate instanceof AutomationStudioRunController) gate.setPhase("adapting");
}
