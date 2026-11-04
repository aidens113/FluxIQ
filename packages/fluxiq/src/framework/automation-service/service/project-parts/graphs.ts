// The library as a run reads it: a pinned version as a graph of this run, and why one
// may not run. Each version is read once per run, so every call to it runs the same
// thing, and its whole call tree is read before its frame starts, so a call that goes
// round in a circle or too deep is refused before anything of it is done.
import type { AutomationStudioPartPin, AutomationStudioPartPinRefusal } from "../../../../engine/automation/frames/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";
import type { AutomationStudioPinnedPartGraphs } from "../runtime-session/index.ts";
import { projectPartRunGraphOf, projectPartRunKey, readProjectPartRunClosure, type ProjectPartRunClosure } from "./run/index.ts";
import { withProjectPartStores } from "./stores.ts";

const REFUSALS: Readonly<Partial<Record<ProjectPartRunClosure["kind"], AutomationStudioPartPinRefusal>>> = {
  call_cycle: { code: "part.call_cycle", message: "This saved part ends up calling itself, so it was not run: it would never come back out." },
  call_too_deep: { code: "part.call_too_deep", message: "This saved part calls parts that call parts too many levels deep, so it was not run." },
  calls_not_available: { code: "part.calls_not_available", message: "This saved part calls another part that is not available, so it was not run." }
};

export function automationStudioPinnedPartGraphs(input: { pool: AutomationStudioProjectDatabasePool | undefined; projectId: string; parentFlowId: string }): AutomationStudioPinnedPartGraphs {
  const closures = new Map<string, Promise<ProjectPartRunClosure | undefined>>();
  const closureOf = (pin: AutomationStudioPartPin): Promise<ProjectPartRunClosure | undefined> => {
    const key = projectPartRunKey(pin.partId, pin.version);
    const known = closures.get(key) ?? withProjectPartStores(input.pool, input.projectId, (stores) => readProjectPartRunClosure(stores, pin.partId, pin.version)).then((read) => ("ok" in read ? undefined : read));
    closures.set(key, known);
    return known;
  };
  return {
    load: async (pin) => {
      const closure = await closureOf(pin);
      return closure?.kind === "found" ? projectPartRunGraphOf({ projectId: input.projectId, parentFlowId: input.parentFlowId, entry: closure.root }).target : undefined;
    },
    refusal: async (pin) => {
      const closure = await closureOf(pin);
      return closure ? REFUSALS[closure.kind] : undefined;
    }
  };
}
