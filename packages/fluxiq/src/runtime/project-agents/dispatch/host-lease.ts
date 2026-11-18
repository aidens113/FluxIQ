import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler, type AutomationStudioHostLeaseBinding, type AutomationStudioHostResourcePort } from "../host-resources/index.ts";

// One scheduler per host port, never per build (automation-project-agents
// plan, A5 notes): two builds on one host share its capacity, so a second
// build's dispatcher must queue behind the first's leases rather than ask the
// port for more than it declared. Keyed weakly, so a port nobody holds is
// collected with its scheduler.

const scopes = new WeakMap<AutomationStudioHostResourcePort, AutomationStudioHostLeaseScope>();
const schedulers = new WeakMap<AutomationStudioHostResourcePort, AutomationStudioHostResourceScheduler>();
const boundScopes = new WeakMap<AutomationStudioHostResourcePort, WeakMap<AutomationStudioHostLeaseBinding, AutomationStudioHostLeaseScope>>();

/** The strict lease scope over the one scheduler for `port`, made on first ask. */
export function automationStudioProjectHostLeaseScope(port: AutomationStudioHostResourcePort, binding?: AutomationStudioHostLeaseBinding): AutomationStudioHostLeaseScope {
  const known = binding ? boundScopes.get(port)?.get(binding) : scopes.get(port);
  if (known) return known;
  let scheduler = schedulers.get(port);
  if (!scheduler) { scheduler = new AutomationStudioHostResourceScheduler(port);
    schedulers.set(port, scheduler); }
  const scope = new AutomationStudioHostLeaseScope(scheduler, binding ? { binding } : {});
  if (binding) {
    let owners = boundScopes.get(port);
    if (!owners) { owners = new WeakMap();
      boundScopes.set(port, owners); }
    owners.set(binding, scope);
  } else scopes.set(port, scope);
  return scope;
}
