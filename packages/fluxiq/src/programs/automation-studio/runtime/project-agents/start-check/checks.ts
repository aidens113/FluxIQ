import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSiteResetStartCheck, AutomationStudioSiteResetLedger } from "../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioSiteResetCallbackPolicies, invokeAutomationStudioSiteResetCallback } from "../../flow-bootstrap/reset-observation/index.ts";

/** Each original checks receiver acquires its current invocation only while it is called. */
export function automationStudioProjectBuildStartChecks(
  reader: AutomationStudioSiteResetStartCheck,
  calls: Pick<AutomationStudioSiteResetLedger, "observedAndFlushed">,
  startIsBuilds: boolean,
  signal?: AbortSignal
) {
  const checks = {
    async compare() {
      if (!startIsBuilds) return { moved: false };
      const invocation = {};
      return await invokeAutomationStudioSiteResetCallback(this, { receiver: reader, callback: reader.compare, args: [signal, invocation] }, signal, invocation);
    },
    async compareAt(place: Parameters<AutomationStudioSiteResetStartCheck["compareAt"]>[0]) {
      const invocation = {};
      return await invokeAutomationStudioSiteResetCallback(this, { receiver: reader, callback: reader.compareAt, args: [place, signal, invocation] }, signal, invocation);
    },
    async lookAt(location: string, start?: JsonObject) {
      const invocation = {};
      const read = await invokeAutomationStudioSiteResetCallback(this, { receiver: reader, callback: reader.lookAt, args: [location, signal, start, invocation] }, signal, invocation);
      if (!("unread" in read)) {
        const observed = {};
        await invokeAutomationStudioSiteResetCallback(this, { receiver: calls, callback: calls.observedAndFlushed, args: [read, true, observed] }, signal, observed);
      }
    }
  };
  for (const callback of [checks.compare, checks.compareAt, checks.lookAt]) AutomationStudioSiteResetCallbackPolicies.remember(checks, callback, "frame");
  return checks;
}
