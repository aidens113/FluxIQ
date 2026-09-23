// The schedule as an interface, so the curve is replaceable rather than
// hard-coded at the call site.
//
// One method, no clock, no store, no provider: everything a schedule needs is
// in the state and the settings it is handed. That is what lets the runtime ask
// "is this run checked?" without knowing which shape answered, and what lets a
// sixth shape -- a time-based one, say, for a Flow run twice a year -- be added
// as a new policy rather than as another branch inside the runtime.

import type { AutomationStudioResultCheckDecision, AutomationStudioResultCheckState } from "./contracts.ts";
import type { AutomationStudioResultCheckSettings, AutomationStudioResultCheckShape } from "./settings.ts";

export type AutomationStudioResultCheckSchedule = {
  readonly shape: AutomationStudioResultCheckShape;
  decide(input: {
    state: AutomationStudioResultCheckState;
    settings: AutomationStudioResultCheckSettings;
  }): AutomationStudioResultCheckDecision;
};
