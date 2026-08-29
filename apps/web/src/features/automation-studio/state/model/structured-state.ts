import type { StateFactViewModel, StateStructuredRow } from "./types";
import { stateValueType } from "./state-facts";

export function buildStructuredStateRows(facts: StateFactViewModel[]): StateStructuredRow[] {
  return facts.map((fact) => {
    const type = stateValueType(fact.rawValue);
    return {
      id: fact.id,
      namespace: fact.namespace,
      path: fact.path,
      label: fact.label,
      value: fact.value,
      ...(type ? { type } : {}),
      ...(fact.confidence !== undefined ? { confidence: `${Math.round(fact.confidence * 100)}%` } : {}),
      ...(fact.source ? { source: fact.source } : {})
    };
  });
}
