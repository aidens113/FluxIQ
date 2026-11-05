// Whether a part may call these versions: the bounds a save holds a new version to, read
// across `part_calls`, so a call that could never finish is refused before it is written
// rather than when it is run. A run reads the same rows (`./run/closure.ts`).
//
// A version that would reach its own part again, at any version, is a cycle here: a
// run could get through one that came back at an older version, but nobody meant it.
import { AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH, type AutomationStudioPartPin } from "../../../../engine/automation/frames/index.ts";
import type { AutomationStudioProjectPartStore } from "../../../persistence/automation/index.ts";

export type ProjectPartCallBound = "part.unresolved_call" | "part.call_cycle" | "part.call_too_deep";

export async function projectPartCallBound(store: Pick<AutomationStudioProjectPartStore, "getVersion" | "listCallsFrom">, caller: { partId?: string | undefined }, callees: readonly AutomationStudioPartPin[]): Promise<ProjectPartCallBound | undefined> {
  const visit = async (pin: AutomationStudioPartPin, path: readonly string[]): Promise<ProjectPartCallBound | undefined> => {
    const key = `${pin.partId}@${pin.version}`;
    if (pin.partId === caller.partId || path.includes(key)) return "part.call_cycle";
    if (path.length >= AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH) return "part.call_too_deep";
    if (!await store.getVersion(pin.partId, pin.version)) return "part.unresolved_call";
    for (const call of await store.listCallsFrom(pin)) {
      const stopped = await visit({ partId: call.partId, version: call.version }, [...path, key]);
      if (stopped) return stopped;
    }
    return undefined;
  };
  // The caller is the first level of its own path: a run counts it the same way.
  const start = caller.partId ? [`${caller.partId}@new`] : [];
  for (const callee of callees) {
    const stopped = await visit(callee, start);
    if (stopped) return stopped;
  }
  return undefined;
}
