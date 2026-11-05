import type { AutomationStudioProjectPartsDependencies } from "../library-types.ts";
import type { AutomationStudioProjectPartRunInput, AutomationStudioProjectPartRunRefusal, AutomationStudioProjectPartRunResult } from "./types.ts";

/**
 * The runner, loaded when a part first runs and not when this module loads: it reads a
 * run as a trial does, and the trial's barrel sits in the service's own module cycle
 * through recovery, as a detached trial's runner does (`detached/subflow.ts`).
 */
export async function runProjectPart(deps: AutomationStudioProjectPartsDependencies, input: AutomationStudioProjectPartRunInput): Promise<AutomationStudioProjectPartRunResult | AutomationStudioProjectPartRunRefusal> {
  const { runProjectPartNow } = await import("./run-part.ts");
  return await runProjectPartNow(deps, input);
}
