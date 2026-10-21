import type { AutomationStudioServiceTrialCollaborators } from "./collaborators.ts";

// Where each Automation Studio service's trial collaborators are found (trace
// plan P5). The service keeps them in private fields and its file is frozen
// (`.structure-baseline.json`), so it hands them over here as it is built, in
// the one field that holds them, and the trial-ports seam asks for them by the
// service. Held weakly: a service nobody holds takes its entry with it. The
// same pattern as the gateway trace's pools (`../../gateway-trace/wiring/service-pools.ts`).

const adopted = new WeakMap<object, AutomationStudioServiceTrialCollaborators>();

/** Each service's trial collaborators, adopted as the service is built and found again by the service (header). */
export const AutomationStudioServiceTrialCollaboratorRegistry = Object.freeze({
  /** Remembers `collaborators` as `owner`'s and answers them unchanged, so it can wrap the expression that makes them. */
  adopt(owner: object, collaborators: AutomationStudioServiceTrialCollaborators): AutomationStudioServiceTrialCollaborators {
    adopted.set(owner, collaborators);
    return collaborators;
  },
  /** The collaborators `owner` adopted, or nothing for an object that is no service. */
  of(owner: object): AutomationStudioServiceTrialCollaborators | undefined {
    return adopted.get(owner);
  }
});
