import type { JsonValue } from "../../../../../core/index.ts";

const observers = new WeakMap<Function, { observe(evidence: JsonValue): void; shownCallIds: Set<string> }>();

/** Associates an executor with the exact evidence-window publication boundary. */
export class AutomationStudioLlmEvidenceVisibility {
  static bind<T extends Function>(executor: T, observe: (evidence: JsonValue) => void): T {
    observers.set(executor, { observe, shownCallIds: new Set() });
    return executor;
  }

  static observeWindow(executor: Function, entries: ReadonlyArray<{ callId: string; value: JsonValue }>): void {
    const observer = observers.get(executor);
    if (!observer) return;
    for (const entry of entries) {
      if (observer.shownCallIds.has(entry.callId)) continue;
      observer.shownCallIds.add(entry.callId);
      observer.observe(entry.value);
    }
  }
}
