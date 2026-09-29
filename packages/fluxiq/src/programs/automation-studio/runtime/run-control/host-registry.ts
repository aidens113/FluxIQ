// Finds a host's run-control registry without the API layer depending on the
// host having one.
//
// The service owns the registry, because the service is what opens and closes
// runs. A host built without it -- an older service, or a test double that
// never runs anything -- still answers pause and resume: with "not live here",
// which is the truth.

import { AutomationStudioRunControlRegistry } from "./registry.ts";

export function automationStudioRunControlOf(host: unknown): AutomationStudioRunControlRegistry | null {
  if (!host || typeof host !== "object") return null;
  const candidate = (host as { runControl?: unknown }).runControl;
  return candidate instanceof AutomationStudioRunControlRegistry ? candidate : null;
}
