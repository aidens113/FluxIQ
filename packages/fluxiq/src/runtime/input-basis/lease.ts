import type { JsonObject } from "../../core/index.ts";
import type { AutomationStudioInputRead, AutomationStudioNormalInputLease, AutomationStudioInputRevision } from "./contracts/index.ts";

/** Values stay in a private closure; JSON serialization contains only the copied reference. */
export function automationStudioNormalInputLease(reference: AutomationStudioInputRevision, values: JsonObject, verify: () => Promise<AutomationStudioInputRead<true>>): AutomationStudioNormalInputLease {
  const issued = Object.freeze({ ...reference });
  let held: JsonObject | undefined = structuredClone(values);
  return Object.freeze({
    reference: issued,
    executionCopy: () => {
      if (!held) throw new Error("input_basis.lease_closed");
      return structuredClone(held);
    },
    verifyCurrent: async (): Promise<AutomationStudioInputRead<true>> => held ? await verify() : { status: "unknown", code: "lease_closed" },
    close: () => { held = undefined; }
  });
}
