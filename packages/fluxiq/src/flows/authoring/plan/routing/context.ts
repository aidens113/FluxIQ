import type { AutomationStudioFlowBootstrapCurrentStructure } from "./current-structure.ts";
import type { AutomationStudioFlowBootstrapRoutePath } from "./path.ts";
import type { AutomationStudioFlowBootstrapRouteSituation } from "./situation.ts";
import type { AutomationStudioFlowBootstrapLastRoute } from "./last-route.ts";

export type AutomationStudioFlowBootstrapRoutingContext = {
  decides: string;
  /** The Flow's structure as it stands, or a sentence saying it has none. */
  current: string | AutomationStudioFlowBootstrapCurrentStructure;
  /** Every path a condition can test. */
  paths: AutomationStudioFlowBootstrapRoutePath[];
  /** The distinct states observed, oldest first; the first is where a run starts. */
  situations: AutomationStudioFlowBootstrapRouteSituation[];
  /**
   * Where the situations are instead, when they are not listed here: an
   * evidence decision carries each in its window, after the call it followed,
   * so a situation is written once and read from cache after (`route-state/build-routing.ts`).
   */
  situationsShown?: string;
  /** Why no state could be observed, when none was. */
  stateUnavailable?: string;
  /** For a change to a Flow that ran: the route that run took, and why. */
  lastRoute?: AutomationStudioFlowBootstrapLastRoute;
};
