import type { AutomationStudioServiceTrialCollaborators } from "./collaborators.ts";
import { AutomationStudioHostLeaseAuthority, type AutomationStudioHostLeaseBinding } from "../../../../runtime/project-agents/host-resources/index.ts";

// Where each Automation Studio service's trial collaborators are found (trace
// plan P5). The service keeps them in private fields and its file is frozen
// (`.structure-baseline.json`), so it hands them over here as it is built, in
// the one field that holds them, and the trial-ports seam asks for them by the
// service. Held weakly: a service nobody holds takes its entry with it. The
// same pattern as the gateway trace's pools (`../../gateway-trace/wiring/service-pools.ts`).

type Adopted = AutomationStudioServiceTrialCollaborators & Readonly<{
  hostLeaseAuthority: AutomationStudioHostLeaseAuthority;
  hostLeaseBinding(): AutomationStudioHostLeaseBinding | undefined;
}>;
const adopted = new WeakMap<object, Adopted>();

/** Each service's trial collaborators, adopted as the service is built and found again by the service (header). */
export const AutomationStudioServiceTrialCollaboratorRegistry = Object.freeze({
  /** Enriches ports with authority issued for the actual owner; supplied fields cannot override it. */
  adopt(owner: object, collaborators: AutomationStudioServiceTrialCollaborators): Adopted {
    const authority = AutomationStudioHostLeaseAuthority.for(owner);
    const ports: Adopted = Object.freeze({
      ...collaborators,
      hostLeaseAuthority: authority,
      hostLeaseBinding: () => {
        const io = collaborators.executor().io;
        return io ? authority.forDomain(io.domainId) : undefined;
      }
    });
    adopted.set(owner, ports);
    return ports;
  },
  /** The collaborators `owner` adopted, or nothing for an object that is no service. */
  of(owner: object): Adopted | undefined {
    return adopted.get(owner);
  }
});
