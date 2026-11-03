import type { AutomationExpectationFact } from "./fact.ts";

/** Retains the latest answer from each source without reconciling different questions. */
export class AutomationExpectationCollector {
  readonly #attempts = new Map<string, Map<string, AutomationExpectationFact>>();

  record(fact: AutomationExpectationFact): void {
    let sources = this.#attempts.get(fact.attemptId);
    if (!sources) {
      sources = new Map();
      this.#attempts.set(fact.attemptId, sources);
    }
    sources.set(fact.source, Object.freeze({
      attemptId: fact.attemptId,
      source: fact.source,
      declaredCount: fact.declaredCount,
      checkedCount: fact.checkedCount,
      outcome: fact.outcome
    }));
  }

  outcome(attemptId: string): AutomationExpectationFact["outcome"] {
    const sources = this.#attempts.get(attemptId);
    return sources?.size === 1 ? sources.values().next().value?.outcome ?? "unknown" : "unknown";
  }

  facts(attemptId: string): readonly AutomationExpectationFact[] {
    return Array.from(this.#attempts.get(attemptId)?.values() ?? []);
  }
}
