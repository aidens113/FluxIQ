import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler, type AutomationStudioHostResourcePort } from "../host-resources/index.ts";

// One scheduler per host port, never per build (automation-project-agents
// plan, A5 notes): two builds on one host share its capacity, so a second
// build's dispatcher must queue behind the first's leases rather than ask the
// port for more than it declared. Keyed weakly, so a port nobody holds is
// collected with its scheduler.

const scopes = new WeakMap<AutomationStudioHostResourcePort, AutomationStudioHostLeaseScope>();

/** The strict lease scope over the one scheduler for `port`, made on first ask. */
export function automationStudioProjectHostLeaseScope(port: AutomationStudioHostResourcePort): AutomationStudioHostLeaseScope {
  const known = scopes.get(port);
  if (known) return known;
  const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(port));
  scopes.set(port, scope);
  return scope;
}
